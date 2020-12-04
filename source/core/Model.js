import {
  cachedShader
} from './createTilesetShader';
const {
  Model,
  numberOfComponentsForType,
  getAccessorByteStride,
  IndexDatatype,
  FeatureDetection,
  SceneMode,
  defined,
  defaultValue,
  Cartesian3,
  addPipelineExtras,
  ModelLoadResources,
  ModelUtility,
  updateVersion,
  addDefaults,
  processPbrMaterials,
  processModelMaterialsCommon,
  DracoLoader,
  Matrix4,
  ForEach,
  hasExtension,
  clone,
  WebGLConstants,
  ModelMaterial,
  ModelMesh,
  ModelNode,
  OctahedralProjectedCubeMap,
  ModelOutlineLoader,
  JobType,
  BufferUsage,
  PrimitiveType,
  ShaderSource,
  Buffer,
  ShaderProgram,
  VertexArray,
  RenderState,
  DepthFunction,
  BoundingSphere,
  combine,
  ShadowMode,
  DrawCommand,
  HeightReference,
  Cartographic,
  Axis,
  Cartesian4,
  Color,
  ColorBlendMode
} = Cesium;
const ModelState = ModelUtility.ModelState
const CesiumMath = Cesium.Math;
//********************
function destroy(property) {
  for (var name in property) {
    if (property.hasOwnProperty(name)) {
      property[name].destroy();
    }
  }
}

function updateColor(model, frameState, forceDerive) {
  // Generate translucent commands when the blend color has an alpha in the range (0.0, 1.0) exclusive
  var scene3DOnly = frameState.scene3DOnly;
  var alpha = model.color.alpha;
  if (alpha > 0.0 && alpha < 1.0) {
    var nodeCommands = model._nodeCommands;
    var length = nodeCommands.length;
    if (!defined(nodeCommands[0].translucentCommand) || forceDerive) {
      for (var i = 0; i < length; ++i) {
        var nodeCommand = nodeCommands[i];
        var command = nodeCommand.command;
        nodeCommand.translucentCommand = deriveTranslucentCommand(command);
        if (!scene3DOnly) {
          var command2D = nodeCommand.command2D;
          nodeCommand.translucentCommand2D = deriveTranslucentCommand(
            command2D
          );
        }
      }
    }
  }
}

function updateBackFaceCulling(model, frameState, forceDerive) {
  var scene3DOnly = frameState.scene3DOnly;
  var backFaceCulling = model.backFaceCulling;
  if (!backFaceCulling) {
    var nodeCommands = model._nodeCommands;
    var length = nodeCommands.length;
    if (!defined(nodeCommands[0].disableCullingCommand) || forceDerive) {
      for (var i = 0; i < length; ++i) {
        var nodeCommand = nodeCommands[i];
        var command = nodeCommand.command;
        nodeCommand.disableCullingCommand = deriveDisableCullingCommand(
          command
        );
        if (!scene3DOnly) {
          var command2D = nodeCommand.command2D;
          nodeCommand.disableCullingCommand2D = deriveDisableCullingCommand(
            command2D
          );
        }
      }
    }
  }
}

function updateSilhouette(model, frameState, force) {
  // Generate silhouette commands when the silhouette size is greater than 0.0 and the alpha is greater than 0.0
  // There are two silhouette commands:
  //     1. silhouetteModelCommand : render model normally while enabling stencil mask
  //     2. silhouetteColorCommand : render enlarged model with a solid color while enabling stencil tests
  if (!hasSilhouette(model, frameState)) {
    return;
  }

  var nodeCommands = model._nodeCommands;
  var dirty =
    alphaDirty(model.color.alpha, model._colorPreviousAlpha) ||
    alphaDirty(
      model.silhouetteColor.alpha,
      model._silhouetteColorPreviousAlpha
    ) ||
    !defined(nodeCommands[0].silhouetteModelCommand);

  model._colorPreviousAlpha = model.color.alpha;
  model._silhouetteColorPreviousAlpha = model.silhouetteColor.alpha;

  if (dirty || force) {
    createSilhouetteCommands(model, frameState);
  }
}

function recreateProgram(programToCreate, model, context) {
  var programId = programToCreate.programId;
  var techniqueId = programToCreate.techniqueId;
  var program = model._sourcePrograms[programId];
  var shaders = model._rendererResources.sourceShaders;

  var quantizedVertexShaders = model._quantizedVertexShaders;

  var clippingPlaneCollection = model.clippingPlanes;
  var addClippingPlaneCode = isClippingEnabled(model);

  var vs = shaders[program.vertexShader];
  var fs = shaders[program.fragmentShader];

  if (
    model.extensionsUsed.WEB3D_quantized_attributes ||
    model._dequantizeInShader
  ) {
    vs = quantizedVertexShaders[programId];
  }

  var finalFS = fs;
  if (isColorShadingEnabled(model)) {
    finalFS = Model._modifyShaderForColor(finalFS);
  }
  if (addClippingPlaneCode) {
    finalFS = modifyShaderForClippingPlanes(
      finalFS,
      clippingPlaneCollection,
      context
    );
  }

  var drawVS = modifyShader(vs, programId, model._vertexShaderLoaded);
  var drawFS = modifyShader(finalFS, programId, model._fragmentShaderLoaded);
  const key = model._resource.request.url;
  if (cachedShader.has(key)) {
    const cshader = cachedShader.get(key);
    if (defined(cshader.fragmentShader)) {
      drawFS = ShaderSource.replaceMain(drawFS, 'czm_cesiumpro_main');
      drawFS += cshader.fragmentShader;
    }
    if (defined(cshader.vertexShader)) {
      drawVS = ShaderSource.replaceMain(drawVS, 'czm_cesiumpro_main');
      drawVS += cshader.vertexShader;
    }
  }

  if (!defined(model._uniformMapLoaded)) {
    drawFS = "uniform vec4 czm_pickColor;\n" + drawFS;
  }

  var useIBL =
    model._imageBasedLightingFactor.x > 0.0 ||
    model._imageBasedLightingFactor.y > 0.0;
  if (useIBL) {
    drawFS = "#define USE_IBL_LIGHTING \n\n" + drawFS;
  }

  if (defined(model._lightColor)) {
    drawFS = "#define USE_CUSTOM_LIGHT_COLOR \n\n" + drawFS;
  }

  if (model._sourceVersion !== "2.0" || model._sourceKHRTechniquesWebGL) {
    drawFS = ShaderSource.replaceMain(drawFS, "non_gamma_corrected_main");
    drawFS =
      drawFS +
      "\n" +
      "void main() { \n" +
      "    non_gamma_corrected_main(); \n" +
      "    gl_FragColor = czm_gammaCorrect(gl_FragColor); \n" +
      "} \n";
  }

  if (OctahedralProjectedCubeMap.isSupported(context)) {
    var usesSH =
      defined(model._sphericalHarmonicCoefficients) ||
      model._useDefaultSphericalHarmonics;
    var usesSM =
      (defined(model._specularEnvironmentMapAtlas) &&
        model._specularEnvironmentMapAtlas.ready) ||
      model._useDefaultSpecularMaps;
    var addMatrix = !addClippingPlaneCode && (usesSH || usesSM || useIBL);
    if (addMatrix) {
      drawFS = "uniform mat4 gltf_clippingPlanesMatrix; \n" + drawFS;
    }

    if (defined(model._sphericalHarmonicCoefficients)) {
      drawFS =
        "#define DIFFUSE_IBL \n" +
        "#define CUSTOM_SPHERICAL_HARMONICS \n" +
        "uniform vec3 gltf_sphericalHarmonicCoefficients[9]; \n" +
        drawFS;
    } else if (model._useDefaultSphericalHarmonics) {
      drawFS = "#define DIFFUSE_IBL \n" + drawFS;
    }

    if (
      defined(model._specularEnvironmentMapAtlas) &&
      model._specularEnvironmentMapAtlas.ready
    ) {
      drawFS =
        "#define SPECULAR_IBL \n" +
        "#define CUSTOM_SPECULAR_IBL \n" +
        "uniform sampler2D gltf_specularMap; \n" +
        "uniform vec2 gltf_specularMapSize; \n" +
        "uniform float gltf_maxSpecularLOD; \n" +
        drawFS;
    } else if (model._useDefaultSpecularMaps) {
      drawFS = "#define SPECULAR_IBL \n" + drawFS;
    }
  }

  if (defined(model._luminanceAtZenith)) {
    drawFS =
      "#define USE_SUN_LUMINANCE \n" +
      "uniform float gltf_luminanceAtZenith;\n" +
      drawFS;
  }

  createAttributesAndProgram(
    programId,
    techniqueId,
    drawFS,
    drawVS,
    model,
    context
  );
}

function isClippingEnabled(model) {
  var clippingPlanes = model._clippingPlanes;
  return (
    defined(clippingPlanes) &&
    clippingPlanes.enabled &&
    clippingPlanes.length !== 0
  );
}

function isColorShadingEnabled(model) {
  return (
    !Color.equals(model.color, Color.WHITE) ||
    model.colorBlendMode !== ColorBlendMode.HIGHLIGHT
  );
}

function updateClippingPlanes(model, frameState) {
  var clippingPlanes = model._clippingPlanes;
  if (defined(clippingPlanes) && clippingPlanes.owner === model) {
    if (clippingPlanes.enabled) {
      clippingPlanes.update(frameState);
    }
  }
}

function updateWireframe(model) {
  if (model._debugWireframe !== model.debugWireframe) {
    model._debugWireframe = model.debugWireframe;

    // This assumes the original primitive was TRIANGLES and that the triangles
    // are connected for the wireframe to look perfect.
    var primitiveType = model.debugWireframe ?
      PrimitiveType.LINES :
      PrimitiveType.TRIANGLES;
    var nodeCommands = model._nodeCommands;
    var length = nodeCommands.length;

    for (var i = 0; i < length; ++i) {
      nodeCommands[i].command.primitiveType = primitiveType;
    }
  }
}

function updateShowBoundingVolume(model) {
  if (model.debugShowBoundingVolume !== model._debugShowBoundingVolume) {
    model._debugShowBoundingVolume = model.debugShowBoundingVolume;

    var debugShowBoundingVolume = model.debugShowBoundingVolume;
    var nodeCommands = model._nodeCommands;
    var length = nodeCommands.length;

    for (var i = 0; i < length; ++i) {
      nodeCommands[i].command.debugShowBoundingVolume = debugShowBoundingVolume;
    }
  }
}

function updateShadows(model) {
  if (model.shadows !== model._shadows) {
    model._shadows = model.shadows;

    var castShadows = ShadowMode.castShadows(model.shadows);
    var receiveShadows = ShadowMode.receiveShadows(model.shadows);
    var nodeCommands = model._nodeCommands;
    var length = nodeCommands.length;

    for (var i = 0; i < length; i++) {
      var nodeCommand = nodeCommands[i];
      nodeCommand.command.castShadows = castShadows;
      nodeCommand.command.receiveShadows = receiveShadows;
    }
  }
}

function updatePickIds(model, context) {
  var id = model.id;
  if (model._id !== id) {
    model._id = id;

    var pickIds = model._pickIds;
    var length = pickIds.length;
    for (var i = 0; i < length; ++i) {
      pickIds[i].object.id = id;
    }
  }
}
var scratchObjectSpace = new Matrix4();

function applySkins(model) {
  var skinnedNodes = model._runtime.skinnedNodes;
  var length = skinnedNodes.length;

  for (var i = 0; i < length; ++i) {
    var node = skinnedNodes[i];

    scratchObjectSpace = Matrix4.inverseTransformation(
      node.transformToRoot,
      scratchObjectSpace
    );

    var computedJointMatrices = node.computedJointMatrices;
    var joints = node.joints;
    var bindShapeMatrix = node.bindShapeMatrix;
    var inverseBindMatrices = node.inverseBindMatrices;
    var inverseBindMatricesLength = inverseBindMatrices.length;

    for (var m = 0; m < inverseBindMatricesLength; ++m) {
      // [joint-matrix] = [node-to-root^-1][joint-to-root][inverse-bind][bind-shape]
      if (!defined(computedJointMatrices[m])) {
        computedJointMatrices[m] = new Matrix4();
      }
      computedJointMatrices[m] = Matrix4.multiplyTransformation(
        scratchObjectSpace,
        joints[m].transformToRoot,
        computedJointMatrices[m]
      );
      computedJointMatrices[m] = Matrix4.multiplyTransformation(
        computedJointMatrices[m],
        inverseBindMatrices[m],
        computedJointMatrices[m]
      );
      if (defined(bindShapeMatrix)) {
        // NOTE: bindShapeMatrix is glTF 1.0 only, removed in glTF 2.0.
        computedJointMatrices[m] = Matrix4.multiplyTransformation(
          computedJointMatrices[m],
          bindShapeMatrix,
          computedJointMatrices[m]
        );
      }
    }
  }
}

function getNodeMatrix(node, result) {
  var publicNode = node.publicNode;
  var publicMatrix = publicNode.matrix;

  if (publicNode.useMatrix && defined(publicMatrix)) {
    // Public matrix overrides original glTF matrix and glTF animations
    Matrix4.clone(publicMatrix, result);
  } else if (defined(node.matrix)) {
    Matrix4.clone(node.matrix, result);
  } else {
    Matrix4.fromTranslationQuaternionRotationScale(
      node.translation,
      node.rotation,
      node.scale,
      result
    );
    // Keep matrix returned by the node in-sync if the node is targeted by an animation.  Only TRS nodes can be targeted.
    publicNode.setMatrix(result);
  }
}
var scratchNodeStack = [];
var scratchComputedTranslation = new Cartesian4();
var scratchComputedMatrixIn2D = new Matrix4();

function updateNodeHierarchyModelMatrix(
  model,
  modelTransformChanged,
  justLoaded,
  projection
) {
  var maxDirtyNumber = model._maxDirtyNumber;

  var rootNodes = model._runtime.rootNodes;
  var length = rootNodes.length;

  var nodeStack = scratchNodeStack;
  var computedModelMatrix = model._computedModelMatrix;

  if (model._mode !== SceneMode.SCENE3D && !model._ignoreCommands) {
    var translation = Matrix4.getColumn(
      computedModelMatrix,
      3,
      scratchComputedTranslation
    );
    if (!Cartesian4.equals(translation, Cartesian4.UNIT_W)) {
      computedModelMatrix = Transforms.basisTo2D(
        projection,
        computedModelMatrix,
        scratchComputedMatrixIn2D
      );
      model._rtcCenter = model._rtcCenter3D;
    } else {
      var center = model.boundingSphere.center;
      var to2D = Transforms.wgs84To2DModelMatrix(
        projection,
        center,
        scratchComputedMatrixIn2D
      );
      computedModelMatrix = Matrix4.multiply(
        to2D,
        computedModelMatrix,
        scratchComputedMatrixIn2D
      );

      if (defined(model._rtcCenter)) {
        Matrix4.setTranslation(
          computedModelMatrix,
          Cartesian4.UNIT_W,
          computedModelMatrix
        );
        model._rtcCenter = model._rtcCenter2D;
      }
    }
  }

  for (var i = 0; i < length; ++i) {
    var n = rootNodes[i];

    getNodeMatrix(n, n.transformToRoot);
    nodeStack.push(n);

    while (nodeStack.length > 0) {
      n = nodeStack.pop();
      var transformToRoot = n.transformToRoot;
      var commands = n.commands;

      if (
        n.dirtyNumber === maxDirtyNumber ||
        modelTransformChanged ||
        justLoaded
      ) {
        var nodeMatrix = Matrix4.multiplyTransformation(
          computedModelMatrix,
          transformToRoot,
          n.computedMatrix
        );
        var commandsLength = commands.length;
        if (commandsLength > 0) {
          // Node has meshes, which has primitives.  Update their commands.
          for (var j = 0; j < commandsLength; ++j) {
            var primitiveCommand = commands[j];
            var command = primitiveCommand.command;
            Matrix4.clone(nodeMatrix, command.modelMatrix);

            // PERFORMANCE_IDEA: Can use transformWithoutScale if no node up to the root has scale (including animation)
            BoundingSphere.transform(
              primitiveCommand.boundingSphere,
              command.modelMatrix,
              command.boundingVolume
            );

            if (defined(model._rtcCenter)) {
              Cartesian3.add(
                model._rtcCenter,
                command.boundingVolume.center,
                command.boundingVolume.center
              );
            }

            // If the model crosses the IDL in 2D, it will be drawn in one viewport, but part of it
            // will be clipped by the viewport. We create a second command that translates the model
            // model matrix to the opposite side of the map so the part that was clipped in one viewport
            // is drawn in the other.
            command = primitiveCommand.command2D;
            if (defined(command) && model._mode === SceneMode.SCENE2D) {
              Matrix4.clone(nodeMatrix, command.modelMatrix);
              command.modelMatrix[13] -=
                CesiumMath.sign(command.modelMatrix[13]) *
                2.0 *
                CesiumMath.PI *
                projection.ellipsoid.maximumRadius;
              BoundingSphere.transform(
                primitiveCommand.boundingSphere,
                command.modelMatrix,
                command.boundingVolume
              );
            }
          }
        }
      }

      var children = n.children;
      if (defined(children)) {
        var childrenLength = children.length;
        for (var k = 0; k < childrenLength; ++k) {
          var child = children[k];

          // A node's transform needs to be updated if
          // - It was targeted for animation this frame, or
          // - Any of its ancestors were targeted for animation this frame

          // PERFORMANCE_IDEA: if a child has multiple parents and only one of the parents
          // is dirty, all the subtrees for each child instance will be dirty; we probably
          // won't see this in the wild often.
          child.dirtyNumber = Math.max(child.dirtyNumber, n.dirtyNumber);

          if (child.dirtyNumber === maxDirtyNumber || justLoaded) {
            // Don't check for modelTransformChanged since if only the model's model matrix changed,
            // we do not need to rebuild the local transform-to-root, only the final
            // [model's-model-matrix][transform-to-root] above.
            getNodeMatrix(child, child.transformToRoot);
            Matrix4.multiplyTransformation(
              transformToRoot,
              child.transformToRoot,
              child.transformToRoot
            );
          }

          nodeStack.push(child);
        }
      }
    }
  }

  ++model._maxDirtyNumber;
}

function createResources(model, frameState) {
  var context = frameState.context;
  var scene3DOnly = frameState.scene3DOnly;
  var quantizedVertexShaders = model._quantizedVertexShaders;
  var techniques = model._sourceTechniques;
  var programs = model._sourcePrograms;

  var resources = model._rendererResources;
  var shaders = resources.sourceShaders;
  if (model._loadRendererResourcesFromCache) {
    shaders = resources.sourceShaders =
      model._cachedRendererResources.sourceShaders;
  }

  for (var techniqueId in techniques) {
    if (techniques.hasOwnProperty(techniqueId)) {
      var programId = techniques[techniqueId].program;
      var program = programs[programId];
      var shader = shaders[program.vertexShader];

      ModelUtility.checkSupportedGlExtensions(program.glExtensions, context);

      if (
        model.extensionsUsed.WEB3D_quantized_attributes ||
        model._dequantizeInShader
      ) {
        var quantizedVS = quantizedVertexShaders[programId];
        if (!defined(quantizedVS)) {
          quantizedVS = modifyShaderForQuantizedAttributes(
            shader,
            programId,
            model
          );
          quantizedVertexShaders[programId] = quantizedVS;
        }
        shader = quantizedVS;
      }

      shader = modifyShader(shader, programId, model._vertexShaderLoaded);
    }
  }

  if (model._loadRendererResourcesFromCache) {
    var cachedResources = model._cachedRendererResources;

    resources.buffers = cachedResources.buffers;
    resources.vertexArrays = cachedResources.vertexArrays;
    resources.programs = cachedResources.programs;
    resources.silhouettePrograms = cachedResources.silhouettePrograms;
    resources.textures = cachedResources.textures;
    resources.samplers = cachedResources.samplers;
    resources.renderStates = cachedResources.renderStates;

    // Vertex arrays are unique to this model, create instead of using the cache.
    if (defined(model._precreatedAttributes)) {
      createVertexArrays(model, context);
    }

    model._cachedGeometryByteLength += getGeometryByteLength(
      cachedResources.buffers
    );
    model._cachedTexturesByteLength += getTexturesByteLength(
      cachedResources.textures
    );
  } else {
    createBuffers(model, frameState); // using glTF bufferViews
    createPrograms(model, frameState);
    createSamplers(model, context);
    loadTexturesFromBufferViews(model);
    createTextures(model, frameState);
  }

  createSkins(model);
  createRuntimeAnimations(model);

  if (!model._loadRendererResourcesFromCache) {
    createVertexArrays(model, context); // using glTF meshes
    createRenderStates(model); // using glTF materials/techniques/states
    // Long-term, we might not cache render states if they could change
    // due to an animation, e.g., a uniform going from opaque to transparent.
    // Could use copy-on-write if it is worth it.  Probably overkill.
  }

  createUniformMaps(model, context); // using glTF materials/techniques
  createRuntimeNodes(model, context, scene3DOnly); // using glTF scene
}

function releaseCachedGltf(model) {
  if (
    defined(model._cacheKey) &&
    defined(model._cachedGltf) &&
    --model._cachedGltf.count === 0
  ) {
    delete gltfCache[model._cacheKey];
  }
  model._cachedGltf = undefined;
}

function updateClamping(model) {
  if (defined(model._removeUpdateHeightCallback)) {
    model._removeUpdateHeightCallback();
    model._removeUpdateHeightCallback = undefined;
  }

  var scene = model._scene;
  if (
    !defined(scene) ||
    !defined(scene.globe) ||
    model.heightReference === HeightReference.NONE
  ) {
    //>>includeStart('debug', pragmas.debug);
    if (model.heightReference !== HeightReference.NONE) {
      throw new DeveloperError(
        "Height reference is not supported without a scene and globe."
      );
    }
    //>>includeEnd('debug');
    model._clampedModelMatrix = undefined;
    return;
  }

  var globe = scene.globe;
  var ellipsoid = globe.ellipsoid;

  // Compute cartographic position so we don't recompute every update
  var modelMatrix = model.modelMatrix;
  scratchPosition.x = modelMatrix[12];
  scratchPosition.y = modelMatrix[13];
  scratchPosition.z = modelMatrix[14];
  var cartoPosition = ellipsoid.cartesianToCartographic(scratchPosition);

  if (!defined(model._clampedModelMatrix)) {
    model._clampedModelMatrix = Matrix4.clone(modelMatrix, new Matrix4());
  }

  // Install callback to handle updating of terrain tiles
  var surface = globe._surface;
  model._removeUpdateHeightCallback = surface.updateHeight(
    cartoPosition,
    getUpdateHeightCallback(model, ellipsoid, cartoPosition)
  );

  // Set the correct height now
  var height = globe.getHeight(cartoPosition);
  if (defined(height)) {
    // Get callback with cartoPosition being the non-clamped position
    var cb = getUpdateHeightCallback(model, ellipsoid, cartoPosition);

    // Compute the clamped cartesian and call updateHeight callback
    Cartographic.clone(cartoPosition, scratchCartographic);
    scratchCartographic.height = height;
    ellipsoid.cartographicToCartesian(scratchCartographic, scratchPosition);
    cb(scratchPosition);
  }
}
var scratchPosition = new Cartesian3();
var scratchCartographic = new Cartographic();

function getScale(model, frameState) {
  var scale = model.scale;

  if (model.minimumPixelSize !== 0.0) {
    // Compute size of bounding sphere in pixels
    var context = frameState.context;
    var maxPixelSize = Math.max(
      context.drawingBufferWidth,
      context.drawingBufferHeight
    );
    var m = defined(model._clampedModelMatrix) ?
      model._clampedModelMatrix :
      model.modelMatrix;
    scratchPosition.x = m[12];
    scratchPosition.y = m[13];
    scratchPosition.z = m[14];

    if (defined(model._rtcCenter)) {
      Cartesian3.add(model._rtcCenter, scratchPosition, scratchPosition);
    }

    if (model._mode !== SceneMode.SCENE3D) {
      var projection = frameState.mapProjection;
      var cartographic = projection.ellipsoid.cartesianToCartographic(
        scratchPosition,
        scratchCartographic
      );
      projection.project(cartographic, scratchPosition);
      Cartesian3.fromElements(
        scratchPosition.z,
        scratchPosition.x,
        scratchPosition.y,
        scratchPosition
      );
    }

    var radius = model.boundingSphere.radius;
    var metersPerPixel = scaleInPixels(scratchPosition, radius, frameState);

    // metersPerPixel is always > 0.0
    var pixelsPerMeter = 1.0 / metersPerPixel;
    var diameterInPixels = Math.min(
      pixelsPerMeter * (2.0 * radius),
      maxPixelSize
    );

    // Maintain model's minimum pixel size
    if (diameterInPixels < model.minimumPixelSize) {
      scale =
        (model.minimumPixelSize * metersPerPixel) /
        (2.0 * model._initialRadius);
    }
  }

  return defined(model.maximumScale) ?
    Math.min(model.maximumScale, scale) :
    scale;
}
var CreateVertexBufferJob = function() {
  this.id = undefined;
  this.model = undefined;
  this.context = undefined;
};

CreateVertexBufferJob.prototype.set = function(id, model, context) {
  this.id = id;
  this.model = model;
  this.context = context;
};

CreateVertexBufferJob.prototype.execute = function() {
  createVertexBuffer(this.id, this.model, this.context);
};

///////////////////////////////////////////////////////////////////////////

function createVertexBuffer(bufferViewId, model, context) {
  var loadResources = model._loadResources;
  var bufferViews = model.gltf.bufferViews;
  var bufferView = bufferViews[bufferViewId];

  // Use bufferView created at runtime
  if (!defined(bufferView)) {
    bufferView = loadResources.createdBufferViews[bufferViewId];
  }

  var vertexBuffer = Buffer.createVertexBuffer({
    context: context,
    typedArray: loadResources.getBuffer(bufferView),
    usage: BufferUsage.STATIC_DRAW,
  });
  vertexBuffer.vertexArrayDestroyable = false;
  model._rendererResources.buffers[bufferViewId] = vertexBuffer;
  model._geometryByteLength += vertexBuffer.sizeInBytes;
}

///////////////////////////////////////////////////////////////////////////
function createSamplers(model) {
  var loadResources = model._loadResources;
  if (loadResources.createSamplers) {
    loadResources.createSamplers = false;

    var rendererSamplers = model._rendererResources.samplers;
    ForEach.sampler(model.gltf, function(sampler, samplerId) {
      rendererSamplers[samplerId] = new Sampler({
        wrapS: sampler.wrapS,
        wrapT: sampler.wrapT,
        minificationFilter: sampler.minFilter,
        magnificationFilter: sampler.magFilter,
      });
    });
  }
}
var CreateIndexBufferJob = function() {
  this.id = undefined;
  this.componentType = undefined;
  this.model = undefined;
  this.context = undefined;
};

CreateIndexBufferJob.prototype.set = function(
  id,
  componentType,
  model,
  context
) {
  this.id = id;
  this.componentType = componentType;
  this.model = model;
  this.context = context;
};

CreateIndexBufferJob.prototype.execute = function() {
  createIndexBuffer(this.id, this.componentType, this.model, this.context);
};

///////////////////////////////////////////////////////////////////////////

function createIndexBuffer(bufferViewId, componentType, model, context) {
  var loadResources = model._loadResources;
  var bufferViews = model.gltf.bufferViews;
  var bufferView = bufferViews[bufferViewId];

  // Use bufferView created at runtime
  if (!defined(bufferView)) {
    bufferView = loadResources.createdBufferViews[bufferViewId];
  }

  var indexBuffer = Buffer.createIndexBuffer({
    context: context,
    typedArray: loadResources.getBuffer(bufferView),
    usage: BufferUsage.STATIC_DRAW,
    indexDatatype: componentType,
  });
  indexBuffer.vertexArrayDestroyable = false;
  model._rendererResources.buffers[bufferViewId] = indexBuffer;
  model._geometryByteLength += indexBuffer.sizeInBytes;
}

var scratchVertexBufferJob = new CreateVertexBufferJob();
var scratchIndexBufferJob = new CreateIndexBufferJob();

function createBuffers(model, frameState) {
  var loadResources = model._loadResources;

  if (loadResources.pendingBufferLoads !== 0) {
    return;
  }

  var context = frameState.context;
  var vertexBuffersToCreate = loadResources.vertexBuffersToCreate;
  var indexBuffersToCreate = loadResources.indexBuffersToCreate;
  var i;

  if (model.asynchronous) {
    while (vertexBuffersToCreate.length > 0) {
      scratchVertexBufferJob.set(vertexBuffersToCreate.peek(), model, context);
      if (
        !frameState.jobScheduler.execute(scratchVertexBufferJob, JobType.BUFFER)
      ) {
        break;
      }
      vertexBuffersToCreate.dequeue();
    }

    while (indexBuffersToCreate.length > 0) {
      i = indexBuffersToCreate.peek();
      scratchIndexBufferJob.set(i.id, i.componentType, model, context);
      if (
        !frameState.jobScheduler.execute(scratchIndexBufferJob, JobType.BUFFER)
      ) {
        break;
      }
      indexBuffersToCreate.dequeue();
    }
  } else {
    while (vertexBuffersToCreate.length > 0) {
      createVertexBuffer(vertexBuffersToCreate.dequeue(), model, context);
    }

    while (indexBuffersToCreate.length > 0) {
      i = indexBuffersToCreate.dequeue();
      createIndexBuffer(i.id, i.componentType, model, context);
    }
  }
}
var CreateProgramJob = function() {
  this.programToCreate = undefined;
  this.model = undefined;
  this.context = undefined;
};

CreateProgramJob.prototype.set = function(programToCreate, model, context) {
  this.programToCreate = programToCreate;
  this.model = model;
  this.context = context;
};

CreateProgramJob.prototype.execute = function() {
  createProgram(this.programToCreate, this.model, this.context);
};
var scratchCreateProgramJob = new CreateProgramJob();

function createPrograms(model, frameState) {
  var loadResources = model._loadResources;
  var programsToCreate = loadResources.programsToCreate;

  if (loadResources.pendingShaderLoads !== 0) {
    return;
  }

  // PERFORMANCE_IDEA: this could be more fine-grained by looking
  // at the shader's bufferView's to determine the buffer dependencies.
  if (loadResources.pendingBufferLoads !== 0) {
    return;
  }

  var context = frameState.context;

  if (model.asynchronous) {
    while (programsToCreate.length > 0) {
      scratchCreateProgramJob.set(programsToCreate.peek(), model, context);
      if (
        !frameState.jobScheduler.execute(
          scratchCreateProgramJob,
          JobType.PROGRAM
        )
      ) {
        break;
      }
      programsToCreate.dequeue();
    }
  } else {
    // Create all loaded programs this frame
    while (programsToCreate.length > 0) {
      createProgram(programsToCreate.dequeue(), model, context);
    }
  }
}

function createProgram(programToCreate, model, context) {
  var programId = programToCreate.programId;
  var techniqueId = programToCreate.techniqueId;
  var program = model._sourcePrograms[programId];
  var shaders = model._rendererResources.sourceShaders;

  var vs = shaders[program.vertexShader];
  var fs = shaders[program.fragmentShader];

  var quantizedVertexShaders = model._quantizedVertexShaders;

  if (
    model.extensionsUsed.WEB3D_quantized_attributes ||
    model._dequantizeInShader
  ) {
    var quantizedVS = quantizedVertexShaders[programId];
    if (!defined(quantizedVS)) {
      quantizedVS = modifyShaderForQuantizedAttributes(vs, programId, model);
      quantizedVertexShaders[programId] = quantizedVS;
    }
    vs = quantizedVS;
  }

  var drawVS = modifyShader(vs, programId, model._vertexShaderLoaded);
  var drawFS = modifyShader(fs, programId, model._fragmentShaderLoaded);

  if (!defined(model._uniformMapLoaded)) {
    drawFS = "uniform vec4 czm_pickColor;\n" + drawFS;
  }

  var useIBL =
    model._imageBasedLightingFactor.x > 0.0 ||
    model._imageBasedLightingFactor.y > 0.0;
  if (useIBL) {
    drawFS = "#define USE_IBL_LIGHTING \n\n" + drawFS;
  }

  if (defined(model._lightColor)) {
    drawFS = "#define USE_CUSTOM_LIGHT_COLOR \n\n" + drawFS;
  }

  if (model._sourceVersion !== "2.0" || model._sourceKHRTechniquesWebGL) {
    drawFS = ShaderSource.replaceMain(drawFS, "non_gamma_corrected_main");
    drawFS =
      drawFS +
      "\n" +
      "void main() { \n" +
      "    non_gamma_corrected_main(); \n" +
      "    gl_FragColor = czm_gammaCorrect(gl_FragColor); \n" +
      "} \n";
  }

  if (OctahedralProjectedCubeMap.isSupported(context)) {
    var usesSH =
      defined(model._sphericalHarmonicCoefficients) ||
      model._useDefaultSphericalHarmonics;
    var usesSM =
      (defined(model._specularEnvironmentMapAtlas) &&
        model._specularEnvironmentMapAtlas.ready) ||
      model._useDefaultSpecularMaps;
    var addMatrix = usesSH || usesSM || useIBL;
    if (addMatrix) {
      drawFS = "uniform mat4 gltf_clippingPlanesMatrix; \n" + drawFS;
    }

    if (defined(model._sphericalHarmonicCoefficients)) {
      drawFS =
        "#define DIFFUSE_IBL \n" +
        "#define CUSTOM_SPHERICAL_HARMONICS \n" +
        "uniform vec3 gltf_sphericalHarmonicCoefficients[9]; \n" +
        drawFS;
    } else if (model._useDefaultSphericalHarmonics) {
      drawFS = "#define DIFFUSE_IBL \n" + drawFS;
    }

    if (
      defined(model._specularEnvironmentMapAtlas) &&
      model._specularEnvironmentMapAtlas.ready
    ) {
      drawFS =
        "#define SPECULAR_IBL \n" +
        "#define CUSTOM_SPECULAR_IBL \n" +
        "uniform sampler2D gltf_specularMap; \n" +
        "uniform vec2 gltf_specularMapSize; \n" +
        "uniform float gltf_maxSpecularLOD; \n" +
        drawFS;
    } else if (model._useDefaultSpecularMaps) {
      drawFS = "#define SPECULAR_IBL \n" + drawFS;
    }
  }

  if (defined(model._luminanceAtZenith)) {
    drawFS =
      "#define USE_SUN_LUMINANCE \n" +
      "uniform float gltf_luminanceAtZenith;\n" +
      drawFS;
  }

  createAttributesAndProgram(
    programId,
    techniqueId,
    drawFS,
    drawVS,
    model,
    context
  );
}

function createAttributesAndProgram(
  programId,
  techniqueId,
  drawFS,
  drawVS,
  model,
  context
) {
  var technique = model._sourceTechniques[techniqueId];
  var attributeLocations = ModelUtility.createAttributeLocations(
    technique,
    model._precreatedAttributes
  );

  model._rendererResources.programs[programId] = ShaderProgram.fromCache({
    context: context,
    vertexShaderSource: drawVS,
    fragmentShaderSource: drawFS,
    attributeLocations: attributeLocations,
  });
}

function loadTexturesFromBufferViews(model) {
  var loadResources = model._loadResources;

  if (loadResources.pendingBufferLoads !== 0) {
    return;
  }

  while (loadResources.texturesToCreateFromBufferView.length > 0) {
    var gltfTexture = loadResources.texturesToCreateFromBufferView.dequeue();

    var gltf = model.gltf;
    var bufferView = gltf.bufferViews[gltfTexture.bufferView];
    var imageId = gltf.textures[gltfTexture.id].source;

    var onerror = ModelUtility.getFailedLoadFunction(
      model,
      "image",
      "id: " + gltfTexture.id + ", bufferView: " + gltfTexture.bufferView
    );

    if (gltfTexture.mimeType === "image/ktx") {
      loadKTX(loadResources.getBuffer(bufferView))
        .then(imageLoad(model, gltfTexture.id, imageId))
        .otherwise(onerror);
      ++model._loadResources.pendingTextureLoads;
    } else if (gltfTexture.mimeType === "image/crn") {
      loadCRN(loadResources.getBuffer(bufferView))
        .then(imageLoad(model, gltfTexture.id, imageId))
        .otherwise(onerror);
      ++model._loadResources.pendingTextureLoads;
    } else {
      var onload = getOnImageCreatedFromTypedArray(loadResources, gltfTexture);
      loadImageFromTypedArray({
          uint8Array: loadResources.getBuffer(bufferView),
          format: gltfTexture.mimeType,
          flipY: false,
        })
        .then(onload)
        .otherwise(onerror);
      ++loadResources.pendingBufferViewToImage;
    }
  }
}
///////////////////////////////////////////////////////////////////////////

var CreateTextureJob = function() {
  this.gltfTexture = undefined;
  this.model = undefined;
  this.context = undefined;
};

CreateTextureJob.prototype.set = function(gltfTexture, model, context) {
  this.gltfTexture = gltfTexture;
  this.model = model;
  this.context = context;
};

CreateTextureJob.prototype.execute = function() {
  createTexture(this.gltfTexture, this.model, this.context);
};

///////////////////////////////////////////////////////////////////////////

function createTexture(gltfTexture, model, context) {
  var textures = model.gltf.textures;
  var texture = textures[gltfTexture.id];

  var rendererSamplers = model._rendererResources.samplers;
  var sampler = rendererSamplers[texture.sampler];
  if (!defined(sampler)) {
    sampler = new Sampler({
      wrapS: TextureWrap.REPEAT,
      wrapT: TextureWrap.REPEAT,
    });
  }

  var usesTextureTransform = false;
  var materials = model.gltf.materials;
  var materialsLength = materials.length;
  for (var i = 0; i < materialsLength; ++i) {
    var material = materials[i];
    if (
      defined(material.extensions) &&
      defined(material.extensions.KHR_techniques_webgl)
    ) {
      var values = material.extensions.KHR_techniques_webgl.values;
      for (var valueName in values) {
        if (
          values.hasOwnProperty(valueName) &&
          valueName.indexOf("Texture") !== -1
        ) {
          var value = values[valueName];
          if (
            value.index === gltfTexture.id &&
            defined(value.extensions) &&
            defined(value.extensions.KHR_texture_transform)
          ) {
            usesTextureTransform = true;
            break;
          }
        }
      }
    }
    if (usesTextureTransform) {
      break;
    }
  }

  var wrapS = sampler.wrapS;
  var wrapT = sampler.wrapT;
  var minFilter = sampler.minificationFilter;

  if (
    usesTextureTransform &&
    minFilter !== TextureMinificationFilter.LINEAR &&
    minFilter !== TextureMinificationFilter.NEAREST
  ) {
    if (
      minFilter === TextureMinificationFilter.NEAREST_MIPMAP_NEAREST ||
      minFilter === TextureMinificationFilter.NEAREST_MIPMAP_LINEAR
    ) {
      minFilter = TextureMinificationFilter.NEAREST;
    } else {
      minFilter = TextureMinificationFilter.LINEAR;
    }

    sampler = new Sampler({
      wrapS: sampler.wrapS,
      wrapT: sampler.wrapT,
      textureMinificationFilter: minFilter,
      textureMagnificationFilter: sampler.magnificationFilter,
    });
  }

  var internalFormat = gltfTexture.internalFormat;

  var mipmap = !(
      defined(internalFormat) && PixelFormat.isCompressedFormat(internalFormat)
    ) &&
    (minFilter === TextureMinificationFilter.NEAREST_MIPMAP_NEAREST ||
      minFilter === TextureMinificationFilter.NEAREST_MIPMAP_LINEAR ||
      minFilter === TextureMinificationFilter.LINEAR_MIPMAP_NEAREST ||
      minFilter === TextureMinificationFilter.LINEAR_MIPMAP_LINEAR);
  var requiresNpot =
    mipmap ||
    wrapS === TextureWrap.REPEAT ||
    wrapS === TextureWrap.MIRRORED_REPEAT ||
    wrapT === TextureWrap.REPEAT ||
    wrapT === TextureWrap.MIRRORED_REPEAT;

  var tx;
  var source = gltfTexture.image;

  if (defined(internalFormat)) {
    tx = new Texture({
      context: context,
      source: {
        arrayBufferView: gltfTexture.bufferView,
      },
      width: gltfTexture.width,
      height: gltfTexture.height,
      pixelFormat: internalFormat,
      sampler: sampler,
    });
  } else if (defined(source)) {
    var npot = !CesiumMath.isPowerOfTwo(source.width) ||
      !CesiumMath.isPowerOfTwo(source.height);

    if (requiresNpot && npot) {
      // WebGL requires power-of-two texture dimensions for mipmapping and REPEAT/MIRRORED_REPEAT wrap modes.
      var canvas = document.createElement("canvas");
      canvas.width = CesiumMath.nextPowerOfTwo(source.width);
      canvas.height = CesiumMath.nextPowerOfTwo(source.height);
      var canvasContext = canvas.getContext("2d");
      canvasContext.drawImage(
        source,
        0,
        0,
        source.width,
        source.height,
        0,
        0,
        canvas.width,
        canvas.height
      );
      source = canvas;
    }

    tx = new Texture({
      context: context,
      source: source,
      pixelFormat: texture.internalFormat,
      pixelDatatype: texture.type,
      sampler: sampler,
      flipY: false,
    });
    // GLTF_SPEC: Support TEXTURE_CUBE_MAP.  https://github.com/KhronosGroup/glTF/issues/40
    if (mipmap) {
      tx.generateMipmap();
    }
  }
  if (defined(tx)) {
    model._rendererResources.textures[gltfTexture.id] = tx;
    model._texturesByteLength += tx.sizeInBytes;
  }
}

var scratchCreateTextureJob = new CreateTextureJob();

function createTextures(model, frameState) {
  var context = frameState.context;
  var texturesToCreate = model._loadResources.texturesToCreate;

  if (model.asynchronous) {
    while (texturesToCreate.length > 0) {
      scratchCreateTextureJob.set(texturesToCreate.peek(), model, context);
      if (
        !frameState.jobScheduler.execute(
          scratchCreateTextureJob,
          JobType.TEXTURE
        )
      ) {
        break;
      }
      texturesToCreate.dequeue();
    }
  } else {
    // Create all loaded textures this frame
    while (texturesToCreate.length > 0) {
      createTexture(texturesToCreate.dequeue(), model, context);
    }
  }
}

function createSkins(model) {
  var loadResources = model._loadResources;

  if (loadResources.pendingBufferLoads !== 0) {
    return;
  }

  if (!loadResources.createSkins) {
    return;
  }
  loadResources.createSkins = false;

  var gltf = model.gltf;
  var accessors = gltf.accessors;
  var runtimeSkins = {};

  ForEach.skin(gltf, function(skin, id) {
    var accessor = accessors[skin.inverseBindMatrices];

    var bindShapeMatrix;
    if (!Matrix4.equals(skin.bindShapeMatrix, Matrix4.IDENTITY)) {
      bindShapeMatrix = Matrix4.clone(skin.bindShapeMatrix);
    }

    runtimeSkins[id] = {
      inverseBindMatrices: ModelAnimationCache.getSkinInverseBindMatrices(
        model,
        accessor
      ),
      bindShapeMatrix: bindShapeMatrix, // not used when undefined
    };
  });

  createJoints(model, runtimeSkins);
}

function createJoints(model, runtimeSkins) {
  var gltf = model.gltf;
  var skins = gltf.skins;
  var nodes = gltf.nodes;
  var runtimeNodes = model._runtime.nodes;

  var skinnedNodesIds = model._loadResources.skinnedNodesIds;
  var length = skinnedNodesIds.length;
  for (var j = 0; j < length; ++j) {
    var id = skinnedNodesIds[j];
    var skinnedNode = runtimeNodes[id];
    var node = nodes[id];

    var runtimeSkin = runtimeSkins[node.skin];
    skinnedNode.inverseBindMatrices = runtimeSkin.inverseBindMatrices;
    skinnedNode.bindShapeMatrix = runtimeSkin.bindShapeMatrix;

    var gltfJoints = skins[node.skin].joints;
    var jointsLength = gltfJoints.length;
    for (var i = 0; i < jointsLength; ++i) {
      var nodeId = gltfJoints[i];
      var jointNode = runtimeNodes[nodeId];
      skinnedNode.joints.push(jointNode);
    }
  }
}

function createRuntimeAnimations(model) {
  var loadResources = model._loadResources;

  if (!loadResources.finishedPendingBufferLoads()) {
    return;
  }

  if (!loadResources.createRuntimeAnimations) {
    return;
  }
  loadResources.createRuntimeAnimations = false;

  model._runtime.animations = [];

  var runtimeNodes = model._runtime.nodes;
  var accessors = model.gltf.accessors;

  ForEach.animation(model.gltf, function(animation, i) {
    var channels = animation.channels;
    var samplers = animation.samplers;

    // Find start and stop time for the entire animation
    var startTime = Number.MAX_VALUE;
    var stopTime = -Number.MAX_VALUE;

    var channelsLength = channels.length;
    var channelEvaluators = new Array(channelsLength);

    for (var j = 0; j < channelsLength; ++j) {
      var channel = channels[j];
      var target = channel.target;
      var path = target.path;
      var sampler = samplers[channel.sampler];
      var input = ModelAnimationCache.getAnimationParameterValues(
        model,
        accessors[sampler.input]
      );
      var output = ModelAnimationCache.getAnimationParameterValues(
        model,
        accessors[sampler.output]
      );

      startTime = Math.min(startTime, input[0]);
      stopTime = Math.max(stopTime, input[input.length - 1]);

      var spline = ModelAnimationCache.getAnimationSpline(
        model,
        i,
        animation,
        channel.sampler,
        sampler,
        input,
        path,
        output
      );

      channelEvaluators[j] = getChannelEvaluator(
        model,
        runtimeNodes[target.node],
        target.path,
        spline
      );
    }

    model._runtime.animations[i] = {
      name: animation.name,
      startTime: startTime,
      stopTime: stopTime,
      channelEvaluators: channelEvaluators,
    };
  });
}

function createVertexArrays(model, context) {
  var loadResources = model._loadResources;
  if (
    !loadResources.finishedBuffersCreation() ||
    !loadResources.finishedProgramCreation() ||
    !loadResources.createVertexArrays
  ) {
    return;
  }
  loadResources.createVertexArrays = false;

  var rendererBuffers = model._rendererResources.buffers;
  var rendererVertexArrays = model._rendererResources.vertexArrays;
  var gltf = model.gltf;
  var accessors = gltf.accessors;
  ForEach.mesh(gltf, function(mesh, meshId) {
    ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
      var attributes = [];
      var attributeLocation;
      var attributeLocations = getAttributeLocations(model, primitive);
      var decodedData =
        model._decodedData[meshId + ".primitive." + primitiveId];
      ForEach.meshPrimitiveAttribute(primitive, function(
        accessorId,
        attributeName
      ) {
        // Skip if the attribute is not used by the material, e.g., because the asset
        // was exported with an attribute that wasn't used and the asset wasn't optimized.
        attributeLocation = attributeLocations[attributeName];
        if (defined(attributeLocation)) {
          // Use attributes of previously decoded draco geometry
          if (defined(decodedData)) {
            var decodedAttributes = decodedData.attributes;
            if (decodedAttributes.hasOwnProperty(attributeName)) {
              var decodedAttribute = decodedAttributes[attributeName];
              attributes.push({
                index: attributeLocation,
                vertexBuffer: rendererBuffers[decodedAttribute.bufferView],
                componentsPerAttribute: decodedAttribute.componentsPerAttribute,
                componentDatatype: decodedAttribute.componentDatatype,
                normalize: decodedAttribute.normalized,
                offsetInBytes: decodedAttribute.byteOffset,
                strideInBytes: decodedAttribute.byteStride,
              });

              return;
            }
          }

          var a = accessors[accessorId];
          var normalize = defined(a.normalized) && a.normalized;
          attributes.push({
            index: attributeLocation,
            vertexBuffer: rendererBuffers[a.bufferView],
            componentsPerAttribute: numberOfComponentsForType(a.type),
            componentDatatype: a.componentType,
            normalize: normalize,
            offsetInBytes: a.byteOffset,
            strideInBytes: getAccessorByteStride(gltf, a),
          });
        }
      });

      // Add pre-created attributes
      var attribute;
      var attributeName;
      var precreatedAttributes = model._precreatedAttributes;
      if (defined(precreatedAttributes)) {
        for (attributeName in precreatedAttributes) {
          if (precreatedAttributes.hasOwnProperty(attributeName)) {
            attributeLocation = attributeLocations[attributeName];
            if (defined(attributeLocation)) {
              attribute = precreatedAttributes[attributeName];
              attribute.index = attributeLocation;
              attributes.push(attribute);
            }
          }
        }
      }

      var indexBuffer;
      if (defined(primitive.indices)) {
        var accessor = accessors[primitive.indices];
        var bufferView = accessor.bufferView;

        // Use buffer of previously decoded draco geometry
        if (defined(decodedData)) {
          bufferView = decodedData.bufferView;
        }

        indexBuffer = rendererBuffers[bufferView];
      }
      rendererVertexArrays[
        meshId + ".primitive." + primitiveId
      ] = new VertexArray({
        context: context,
        attributes: attributes,
        indexBuffer: indexBuffer,
      });
    });
  });
}

function getAttributeLocations(model, primitive) {
  var techniques = model._sourceTechniques;

  // Retrieve the compiled shader program to assign index values to attributes
  var attributeLocations = {};

  var location;
  var index;
  var material = model._runtime.materialsById[primitive.material];
  if (!defined(material)) {
    return attributeLocations;
  }

  var technique = techniques[material._technique];
  if (!defined(technique)) {
    return attributeLocations;
  }

  var attributes = technique.attributes;
  var program = model._rendererResources.programs[technique.program];
  var programVertexAttributes = program.vertexAttributes;
  var programAttributeLocations = program._attributeLocations;

  // Note: WebGL shader compiler may have optimized and removed some attributes from programVertexAttributes
  for (location in programVertexAttributes) {
    if (programVertexAttributes.hasOwnProperty(location)) {
      var attribute = attributes[location];
      if (defined(attribute)) {
        index = programAttributeLocations[location];
        attributeLocations[attribute.semantic] = index;
      }
    }
  }

  // Always add pre-created attributes.
  // Some pre-created attributes, like per-instance pickIds, may be compiled out of the draw program
  // but should be included in the list of attribute locations for the pick program.
  // This is safe to do since programVertexAttributes and programAttributeLocations are equivalent except
  // that programVertexAttributes optimizes out unused attributes.
  var precreatedAttributes = model._precreatedAttributes;
  if (defined(precreatedAttributes)) {
    for (location in precreatedAttributes) {
      if (precreatedAttributes.hasOwnProperty(location)) {
        index = programAttributeLocations[location];
        attributeLocations[location] = index;
      }
    }
  }

  return attributeLocations;
}

function createRenderStates(model) {
  var loadResources = model._loadResources;
  if (loadResources.createRenderStates) {
    loadResources.createRenderStates = false;

    ForEach.material(model.gltf, function(material, materialId) {
      createRenderStateForMaterial(model, material, materialId);
    });
  }
}

function createRenderStateForMaterial(model, material, materialId) {
  var rendererRenderStates = model._rendererResources.renderStates;

  var blendEquationSeparate = [
    WebGLConstants.FUNC_ADD,
    WebGLConstants.FUNC_ADD,
  ];
  var blendFuncSeparate = [
    WebGLConstants.ONE,
    WebGLConstants.ONE_MINUS_SRC_ALPHA,
    WebGLConstants.ONE,
    WebGLConstants.ONE_MINUS_SRC_ALPHA,
  ];

  if (defined(material.extensions) && defined(material.extensions.KHR_blend)) {
    blendEquationSeparate = material.extensions.KHR_blend.blendEquation;
    blendFuncSeparate = material.extensions.KHR_blend.blendFactors;
  }

  var enableCulling = !material.doubleSided;
  var blendingEnabled = material.alphaMode === "BLEND";
  rendererRenderStates[materialId] = RenderState.fromCache({
    cull: {
      enabled: enableCulling,
    },
    depthTest: {
      enabled: true,
      func: DepthFunction.LESS_OR_EQUAL,
    },
    depthMask: !blendingEnabled,
    blending: {
      enabled: blendingEnabled,
      equationRgb: blendEquationSeparate[0],
      equationAlpha: blendEquationSeparate[1],
      functionSourceRgb: blendFuncSeparate[0],
      functionDestinationRgb: blendFuncSeparate[1],
      functionSourceAlpha: blendFuncSeparate[2],
      functionDestinationAlpha: blendFuncSeparate[3],
    },
  });
}

function createUniformMaps(model, context) {
  var loadResources = model._loadResources;

  if (!loadResources.finishedProgramCreation()) {
    return;
  }

  if (!loadResources.createUniformMaps) {
    return;
  }
  loadResources.createUniformMaps = false;

  var gltf = model.gltf;
  var techniques = model._sourceTechniques;
  var uniformMaps = model._uniformMaps;

  var textures = model._rendererResources.textures;
  var defaultTexture = model._defaultTexture;

  ForEach.material(gltf, function(material, materialId) {
    var modelMaterial = model._runtime.materialsById[materialId];
    var technique = techniques[modelMaterial._technique];
    var instanceValues = modelMaterial._values;

    var uniforms = createUniformsForMaterial(
      model,
      material,
      technique,
      instanceValues,
      context,
      textures,
      defaultTexture
    );

    var u = uniformMaps[materialId];
    u.uniformMap = uniforms.map; // uniform name -> function for the renderer
    u.values = uniforms.values; // material parameter name -> ModelMaterial for modifying the parameter at runtime
    u.jointMatrixUniformName = uniforms.jointMatrixUniformName;
    u.morphWeightsUniformName = uniforms.morphWeightsUniformName;

    if (defined(technique.attributes.a_outlineCoordinates)) {
      var outlineTexture = ModelOutlineLoader.createTexture(model, context);
      u.uniformMap.u_outlineTexture = function() {
        return outlineTexture;
      };
    }
  });
}

function createUniformsForMaterial(
  model,
  material,
  technique,
  instanceValues,
  context,
  textures,
  defaultTexture
) {
  var uniformMap = {};
  var uniformValues = {};
  var jointMatrixUniformName;
  var morphWeightsUniformName;

  ForEach.techniqueUniform(technique, function(uniform, uniformName) {
    // GLTF_SPEC: This does not take into account uniform arrays,
    // indicated by uniforms with a count property.
    //
    // https://github.com/KhronosGroup/glTF/issues/258

    // GLTF_SPEC: In this implementation, material parameters with a
    // semantic or targeted via a source (for animation) are not
    // targetable for material animations.  Is this too strict?
    //
    // https://github.com/KhronosGroup/glTF/issues/142

    var uv;
    if (defined(instanceValues) && defined(instanceValues[uniformName])) {
      // Parameter overrides by the instance technique
      uv = ModelUtility.createUniformFunction(
        uniform.type,
        instanceValues[uniformName],
        textures,
        defaultTexture
      );
      uniformMap[uniformName] = uv.func;
      uniformValues[uniformName] = uv;
    } else if (defined(uniform.node)) {
      uniformMap[uniformName] = getUniformFunctionFromSource(
        uniform.node,
        model,
        uniform.semantic,
        context.uniformState
      );
    } else if (defined(uniform.semantic)) {
      if (uniform.semantic === "JOINTMATRIX") {
        jointMatrixUniformName = uniformName;
      } else if (uniform.semantic === "MORPHWEIGHTS") {
        morphWeightsUniformName = uniformName;
      } else if (uniform.semantic === "ALPHACUTOFF") {
        // The material's alphaCutoff value uses a uniform with semantic ALPHACUTOFF.
        // A uniform with this semantic will ignore the instance or default values.
        var alphaMode = material.alphaMode;
        if (defined(alphaMode) && alphaMode === "MASK") {
          var alphaCutoffValue = defaultValue(material.alphaCutoff, 0.5);
          uv = ModelUtility.createUniformFunction(
            uniform.type,
            alphaCutoffValue,
            textures,
            defaultTexture
          );
          uniformMap[uniformName] = uv.func;
          uniformValues[uniformName] = uv;
        }
      } else {
        // Map glTF semantic to Cesium automatic uniform
        uniformMap[uniformName] = ModelUtility.getGltfSemanticUniforms()[
          uniform.semantic
        ](context.uniformState, model);
      }
    } else if (defined(uniform.value)) {
      // Technique value that isn't overridden by a material
      var uv2 = ModelUtility.createUniformFunction(
        uniform.type,
        uniform.value,
        textures,
        defaultTexture
      );
      uniformMap[uniformName] = uv2.func;
      uniformValues[uniformName] = uv2;
    }
  });

  return {
    map: uniformMap,
    values: uniformValues,
    jointMatrixUniformName: jointMatrixUniformName,
    morphWeightsUniformName: morphWeightsUniformName,
  };
}

function createRuntimeNodes(model, context, scene3DOnly) {
  var loadResources = model._loadResources;

  if (!loadResources.finishedEverythingButTextureCreation()) {
    return;
  }

  if (!loadResources.createRuntimeNodes) {
    return;
  }
  loadResources.createRuntimeNodes = false;

  var rootNodes = [];
  var runtimeNodes = model._runtime.nodes;

  var gltf = model.gltf;
  var nodes = gltf.nodes;

  var scene = gltf.scenes[gltf.scene];
  var sceneNodes = scene.nodes;
  var length = sceneNodes.length;

  var stack = [];
  var seen = {};

  for (var i = 0; i < length; ++i) {
    stack.push({
      parentRuntimeNode: undefined,
      gltfNode: nodes[sceneNodes[i]],
      id: sceneNodes[i],
    });

    while (stack.length > 0) {
      var n = stack.pop();
      seen[n.id] = true;
      var parentRuntimeNode = n.parentRuntimeNode;
      var gltfNode = n.gltfNode;

      // Node hierarchy is a DAG so a node can have more than one parent so it may already exist
      var runtimeNode = runtimeNodes[n.id];
      if (runtimeNode.parents.length === 0) {
        if (defined(gltfNode.matrix)) {
          runtimeNode.matrix = Matrix4.fromColumnMajorArray(gltfNode.matrix);
        } else {
          // TRS converted to Cesium types
          var rotation = gltfNode.rotation;
          runtimeNode.translation = Cartesian3.fromArray(gltfNode.translation);
          runtimeNode.rotation = Quaternion.unpack(rotation);
          runtimeNode.scale = Cartesian3.fromArray(gltfNode.scale);
        }
      }

      if (defined(parentRuntimeNode)) {
        parentRuntimeNode.children.push(runtimeNode);
        runtimeNode.parents.push(parentRuntimeNode);
      } else {
        rootNodes.push(runtimeNode);
      }

      if (defined(gltfNode.mesh)) {
        createCommand(model, gltfNode, runtimeNode, context, scene3DOnly);
      }

      var children = gltfNode.children;
      if (defined(children)) {
        var childrenLength = children.length;
        for (var j = 0; j < childrenLength; j++) {
          var childId = children[j];
          if (!seen[childId]) {
            stack.push({
              parentRuntimeNode: runtimeNode,
              gltfNode: nodes[childId],
              id: children[j],
            });
          }
        }
      }
    }
  }

  model._runtime.rootNodes = rootNodes;
  model._runtime.nodes = runtimeNodes;
}

function createCommand(model, gltfNode, runtimeNode, context, scene3DOnly) {
  var nodeCommands = model._nodeCommands;
  var pickIds = model._pickIds;
  var allowPicking = model.allowPicking;
  var runtimeMeshesByName = model._runtime.meshesByName;

  var resources = model._rendererResources;
  var rendererVertexArrays = resources.vertexArrays;
  var rendererPrograms = resources.programs;
  var rendererRenderStates = resources.renderStates;
  var uniformMaps = model._uniformMaps;

  var gltf = model.gltf;
  var accessors = gltf.accessors;
  var gltfMeshes = gltf.meshes;

  var id = gltfNode.mesh;
  var mesh = gltfMeshes[id];

  var primitives = mesh.primitives;
  var length = primitives.length;

  // The glTF node hierarchy is a DAG so a node can have more than one
  // parent, so a node may already have commands.  If so, append more
  // since they will have a different model matrix.

  for (var i = 0; i < length; ++i) {
    var primitive = primitives[i];
    var ix = accessors[primitive.indices];
    var material = model._runtime.materialsById[primitive.material];
    var programId = material._program;
    var decodedData = model._decodedData[id + ".primitive." + i];

    var boundingSphere;
    var positionAccessor = primitive.attributes.POSITION;
    if (defined(positionAccessor)) {
      var minMax = ModelUtility.getAccessorMinMax(gltf, positionAccessor);
      boundingSphere = BoundingSphere.fromCornerPoints(
        Cartesian3.fromArray(minMax.min),
        Cartesian3.fromArray(minMax.max)
      );
    }

    var vertexArray = rendererVertexArrays[id + ".primitive." + i];
    var offset;
    var count;

    // Use indices of the previously decoded Draco geometry.
    if (defined(decodedData)) {
      count = decodedData.numberOfIndices;
      offset = 0;
    } else if (defined(ix)) {
      count = ix.count;
      offset = ix.byteOffset / IndexDatatype.getSizeInBytes(ix.componentType); // glTF has offset in bytes.  Cesium has offsets in indices
    } else {
      var positions = accessors[primitive.attributes.POSITION];
      count = positions.count;
      offset = 0;
    }

    // Update model triangle count using number of indices
    model._trianglesLength += triangleCountFromPrimitiveIndices(
      primitive,
      count
    );

    var um = uniformMaps[primitive.material];
    var uniformMap = um.uniformMap;
    if (defined(um.jointMatrixUniformName)) {
      var jointUniformMap = {};
      jointUniformMap[um.jointMatrixUniformName] = createJointMatricesFunction(
        runtimeNode
      );

      uniformMap = combine(uniformMap, jointUniformMap);
    }
    if (defined(um.morphWeightsUniformName)) {
      var morphWeightsUniformMap = {};
      morphWeightsUniformMap[
        um.morphWeightsUniformName
      ] = createMorphWeightsFunction(runtimeNode);

      uniformMap = combine(uniformMap, morphWeightsUniformMap);
    }

    uniformMap = combine(uniformMap, {
      gltf_color: createColorFunction(model),
      gltf_colorBlend: createColorBlendFunction(model),
      gltf_clippingPlanes: createClippingPlanesFunction(model),
      gltf_clippingPlanesEdgeStyle: createClippingPlanesEdgeStyleFunction(
        model
      ),
      gltf_clippingPlanesMatrix: createClippingPlanesMatrixFunction(model),
      gltf_iblFactor: createIBLFactorFunction(model),
      gltf_lightColor: createLightColorFunction(model),
      gltf_sphericalHarmonicCoefficients: createSphericalHarmonicCoefficientsFunction(
        model
      ),
      gltf_specularMap: createSpecularEnvironmentMapFunction(model),
      gltf_specularMapSize: createSpecularEnvironmentMapSizeFunction(model),
      gltf_maxSpecularLOD: createSpecularEnvironmentMapLOD(model),
      gltf_luminanceAtZenith: createLuminanceAtZenithFunction(model),
    });

    // Allow callback to modify the uniformMap
    if (defined(model._uniformMapLoaded)) {
      uniformMap = model._uniformMapLoaded(uniformMap, programId, runtimeNode);
    }

    // Add uniforms for decoding quantized attributes if used
    var quantizedUniformMap = {};
    if (model.extensionsUsed.WEB3D_quantized_attributes) {
      quantizedUniformMap = createUniformsForQuantizedAttributes(
        model,
        primitive
      );
    } else if (model._dequantizeInShader && defined(decodedData)) {
      quantizedUniformMap = createUniformsForDracoQuantizedAttributes(
        decodedData
      );
    }
    uniformMap = combine(uniformMap, quantizedUniformMap);

    var rs = rendererRenderStates[primitive.material];
    var isTranslucent = rs.blending.enabled;

    var owner = model._pickObject;
    if (!defined(owner)) {
      owner = {
        primitive: model,
        id: model.id,
        node: runtimeNode.publicNode,
        mesh: runtimeMeshesByName[mesh.name],
      };
    }

    var castShadows = ShadowMode.castShadows(model._shadows);
    var receiveShadows = ShadowMode.receiveShadows(model._shadows);

    var pickId;
    if (allowPicking && !defined(model._uniformMapLoaded)) {
      pickId = context.createPickId(owner);
      pickIds.push(pickId);
      var pickUniforms = {
        czm_pickColor: createPickColorFunction(pickId.color),
      };
      uniformMap = combine(uniformMap, pickUniforms);
    }

    if (allowPicking) {
      if (defined(model._pickIdLoaded) && defined(model._uniformMapLoaded)) {
        pickId = model._pickIdLoaded();
      } else {
        pickId = "czm_pickColor";
      }
    }

    var command = new DrawCommand({
      boundingVolume: new BoundingSphere(), // updated in update()
      cull: model.cull,
      modelMatrix: new Matrix4(), // computed in update()
      primitiveType: primitive.mode,
      vertexArray: vertexArray,
      count: count,
      offset: offset,
      shaderProgram: rendererPrograms[programId],
      castShadows: castShadows,
      receiveShadows: receiveShadows,
      uniformMap: uniformMap,
      renderState: rs,
      owner: owner,
      pass: isTranslucent ? Pass.TRANSLUCENT : model.opaquePass,
      pickId: pickId,
    });

    var command2D;
    if (!scene3DOnly) {
      command2D = DrawCommand.shallowClone(command);
      command2D.boundingVolume = new BoundingSphere(); // updated in update()
      command2D.modelMatrix = new Matrix4(); // updated in update()
    }

    var nodeCommand = {
      show: true,
      boundingSphere: boundingSphere,
      command: command,
      command2D: command2D,
      // Generated on demand when silhouette size is greater than 0.0 and silhouette alpha is greater than 0.0
      silhouetteModelCommand: undefined,
      silhouetteModelCommand2D: undefined,
      silhouetteColorCommand: undefined,
      silhouetteColorCommand2D: undefined,
      // Generated on demand when color alpha is less than 1.0
      translucentCommand: undefined,
      translucentCommand2D: undefined,
      // Generated on demand when back face culling is false
      disableCullingCommand: undefined,
      disableCullingCommand2D: undefined,
      // For updating node commands on shader reconstruction
      programId: programId,
    };
    runtimeNode.commands.push(nodeCommand);
    nodeCommands.push(nodeCommand);
  }
}

function triangleCountFromPrimitiveIndices(primitive, indicesCount) {
  switch (primitive.mode) {
    case PrimitiveType.TRIANGLES:
      return indicesCount / 3;
    case PrimitiveType.TRIANGLE_STRIP:
    case PrimitiveType.TRIANGLE_FAN:
      return Math.max(indicesCount - 2, 0);
    default:
      return 0;
  }
}

function createColorFunction(model) {
  return function() {
    return model.color;
  };
}

function createColorBlendFunction(model) {
  return function() {
    return ColorBlendMode.getColorBlend(
      model.colorBlendMode,
      model.colorBlendAmount
    );
  };
}

function createClippingPlanesFunction(model) {
  return function() {
    var clippingPlanes = model.clippingPlanes;
    return !defined(clippingPlanes) || !clippingPlanes.enabled ?
      model._defaultTexture :
      clippingPlanes.texture;
  };
}

function createClippingPlanesEdgeStyleFunction(model) {
  return function() {
    var clippingPlanes = model.clippingPlanes;
    if (!defined(clippingPlanes)) {
      return Color.WHITE.withAlpha(0.0);
    }

    var style = Color.clone(clippingPlanes.edgeColor);
    style.alpha = clippingPlanes.edgeWidth;
    return style;
  };
}
var scratchClippingPlaneMatrix = new Matrix4();

function createClippingPlanesMatrixFunction(model) {
  return function() {
    var clippingPlanes = model.clippingPlanes;
    if (
      !defined(clippingPlanes) &&
      !defined(model._sphericalHarmonicCoefficients) &&
      !defined(model._specularEnvironmentMaps)
    ) {
      return Matrix4.IDENTITY;
    }
    var modelMatrix = defined(clippingPlanes) ?
      clippingPlanes.modelMatrix :
      Matrix4.IDENTITY;
    return Matrix4.multiply(
      model._clippingPlaneModelViewMatrix,
      modelMatrix,
      scratchClippingPlaneMatrix
    );
  };
}

function createSpecularEnvironmentMapLOD(model) {
  return function() {
    return model._specularEnvironmentMapAtlas.maximumMipmapLevel;
  };
}

function createIBLFactorFunction(model) {
  return function() {
    return model._imageBasedLightingFactor;
  };
}

function createLightColorFunction(model) {
  return function() {
    return model._lightColor;
  };
}

function createUniformsForDracoQuantizedAttributes(decodedData) {
  return ModelUtility.createUniformsForDracoQuantizedAttributes(
    decodedData.attributes
  );
}

function createLuminanceAtZenithFunction(model) {
  return function() {
    return model.luminanceAtZenith;
  };
}

function createSphericalHarmonicCoefficientsFunction(model) {
  return function() {
    return model._sphericalHarmonicCoefficients;
  };
}

function createSpecularEnvironmentMapFunction(model) {
  return function() {
    return model._specularEnvironmentMapAtlas.texture;
  };
}

function createSpecularEnvironmentMapSizeFunction(model) {
  return function() {
    return model._specularEnvironmentMapAtlas.texture.dimensions;
  };
}

function modifyShaderForQuantizedAttributes(shader, programName, model) {
  var primitive;
  var primitives = model._programPrimitives[programName];

  // If no primitives were cached for this program, there's no need to modify the shader
  if (!defined(primitives)) {
    return shader;
  }

  var primitiveId;
  for (primitiveId in primitives) {
    if (primitives.hasOwnProperty(primitiveId)) {
      primitive = primitives[primitiveId];
      if (getProgramForPrimitive(model, primitive) === programName) {
        break;
      }
    }
  }

  // This is not needed after the program is processed, free the memory
  model._programPrimitives[programName] = undefined;

  var result;
  if (model.extensionsUsed.WEB3D_quantized_attributes) {
    result = ModelUtility.modifyShaderForQuantizedAttributes(
      model.gltf,
      primitive,
      shader
    );
    model._quantizedUniforms[programName] = result.uniforms;
  } else {
    var decodedData = model._decodedData[primitiveId];
    if (defined(decodedData)) {
      result = ModelUtility.modifyShaderForDracoQuantizedAttributes(
        model.gltf,
        primitive,
        shader,
        decodedData.attributes
      );
    } else {
      return shader;
    }
  }

  return result.shader;
}

function modifyShader(shader, programName, callback) {
  if (defined(callback)) {
    shader = callback(shader, programName);
  }
  return shader;
}

function isTranslucent(model) {
  return model.color.alpha > 0.0 && model.color.alpha < 1.0;
}

function isInvisible(model) {
  return model.color.alpha === 0.0;
}

function silhouetteSupported(context) {
  return context.stencilBuffer;
}

function hasSilhouette(model, frameState) {
  return (
    silhouetteSupported(frameState.context) &&
    model.silhouetteSize > 0.0 &&
    model.silhouetteColor.alpha > 0.0 &&
    defined(model._normalAttributeName)
  );
}

function getProgramForPrimitive(model, primitive) {
  var material = model._runtime.materialsById[primitive.material];
  if (!defined(material)) {
    return;
  }

  return material._program;
}

function parseShaders(model) {
  var gltf = model.gltf;
  var buffers = gltf.buffers;
  var bufferViews = gltf.bufferViews;
  var sourceShaders = model._rendererResources.sourceShaders;
  ForEach.shader(gltf, function(shader, id) {
    // Shader references either uri (external or base64-encoded) or bufferView
    if (defined(shader.bufferView)) {
      var bufferViewId = shader.bufferView;
      var bufferView = bufferViews[bufferViewId];
      var bufferId = bufferView.buffer;
      var buffer = buffers[bufferId];
      var source = getStringFromTypedArray(
        buffer.extras._pipeline.source,
        bufferView.byteOffset,
        bufferView.byteLength
      );
      sourceShaders[id] = source;
    } else if (defined(shader.extras._pipeline.source)) {
      sourceShaders[id] = shader.extras._pipeline.source;
    } else {
      ++model._loadResources.pendingShaderLoads;

      var shaderResource = model._resource.getDerivedResource({
        url: shader.uri,
      });

      shaderResource
        .fetchText()
        .then(shaderLoad(model, shader.type, id))
        .otherwise(
          ModelUtility.getFailedLoadFunction(
            model,
            "shader",
            shaderResource.url
          )
        );
    }
  });
}

function parsePrograms(model) {
  var sourceTechniques = model._sourceTechniques;
  for (var techniqueId in sourceTechniques) {
    if (sourceTechniques.hasOwnProperty(techniqueId)) {
      var technique = sourceTechniques[techniqueId];
      model._loadResources.programsToCreate.enqueue({
        programId: technique.program,
        techniqueId: techniqueId,
      });
    }
  }
}

function parseBufferViews(model) {
  var bufferViews = model.gltf.bufferViews;
  var vertexBuffersToCreate = model._loadResources.vertexBuffersToCreate;

  // Only ARRAY_BUFFER here.  ELEMENT_ARRAY_BUFFER created below.
  ForEach.bufferView(model.gltf, function(bufferView, id) {
    if (bufferView.target === WebGLConstants.ARRAY_BUFFER) {
      vertexBuffersToCreate.enqueue(id);
    }
  });

  var indexBuffersToCreate = model._loadResources.indexBuffersToCreate;
  var indexBufferIds = {};

  // The Cesium Renderer requires knowing the datatype for an index buffer
  // at creation type, which is not part of the glTF bufferview so loop
  // through glTF accessors to create the bufferview's index buffer.
  ForEach.accessor(model.gltf, function(accessor) {
    var bufferViewId = accessor.bufferView;
    if (!defined(bufferViewId)) {
      return;
    }

    var bufferView = bufferViews[bufferViewId];
    if (
      bufferView.target === WebGLConstants.ELEMENT_ARRAY_BUFFER &&
      !defined(indexBufferIds[bufferViewId])
    ) {
      indexBufferIds[bufferViewId] = true;
      indexBuffersToCreate.enqueue({
        id: bufferViewId,
        componentType: accessor.componentType,
      });
    }
  });
}

function parseTechniques(model) {
  // retain references to gltf techniques
  var gltf = model.gltf;
  if (!hasExtension(gltf, "KHR_techniques_webgl")) {
    return;
  }

  var sourcePrograms = model._sourcePrograms;
  var sourceTechniques = model._sourceTechniques;
  var programs = gltf.extensions.KHR_techniques_webgl.programs;

  ForEach.technique(gltf, function(technique, techniqueId) {
    sourceTechniques[techniqueId] = clone(technique);

    var programId = technique.program;
    if (!defined(sourcePrograms[programId])) {
      sourcePrograms[programId] = clone(programs[programId]);
    }
  });
}

function bufferLoad(model, id) {
  return function(arrayBuffer) {
    var loadResources = model._loadResources;
    var buffer = new Uint8Array(arrayBuffer);
    --loadResources.pendingBufferLoads;
    model.gltf.buffers[id].extras._pipeline.source = buffer;
  };
}

function CachedRendererResources(context, cacheKey) {
  this.buffers = undefined;
  this.vertexArrays = undefined;
  this.programs = undefined;
  this.sourceShaders = undefined;
  this.silhouettePrograms = undefined;
  this.textures = undefined;
  this.samplers = undefined;
  this.renderStates = undefined;
  this.ready = false;

  this.context = context;
  this.cacheKey = cacheKey;
  this.count = 0;
}

function addBuffersToLoadResources(model) {
  var gltf = model.gltf;
  var loadResources = model._loadResources;
  ForEach.buffer(gltf, function(buffer, id) {
    loadResources.buffers[id] = buffer.extras._pipeline.source;
  });
}
var ktxRegex = /(^data:image\/ktx)|(\.ktx$)/i;
var crnRegex = /(^data:image\/crn)|(\.crn$)/i;

function parseArticulations(model) {
  var articulationsByName = {};
  var articulationsByStageKey = {};
  var runtimeStagesByKey = {};

  model._runtime.articulationsByName = articulationsByName;
  model._runtime.articulationsByStageKey = articulationsByStageKey;
  model._runtime.stagesByKey = runtimeStagesByKey;

  var gltf = model.gltf;
  if (
    !hasExtension(gltf, "AGI_articulations") ||
    !defined(gltf.extensions) ||
    !defined(gltf.extensions.AGI_articulations)
  ) {
    return;
  }

  var gltfArticulations = gltf.extensions.AGI_articulations.articulations;
  if (!defined(gltfArticulations)) {
    return;
  }

  var numArticulations = gltfArticulations.length;
  for (var i = 0; i < numArticulations; ++i) {
    var articulation = clone(gltfArticulations[i]);
    articulation.nodes = [];
    articulation.isDirty = true;
    articulationsByName[articulation.name] = articulation;

    var numStages = articulation.stages.length;
    for (var s = 0; s < numStages; ++s) {
      var stage = articulation.stages[s];
      stage.currentValue = stage.initialValue;

      var stageKey = articulation.name + " " + stage.name;
      articulationsByStageKey[stageKey] = articulation;
      runtimeStagesByKey[stageKey] = stage;
    }
  }
}

function parseTextures(model, context, supportsWebP) {
  var gltf = model.gltf;
  var images = gltf.images;
  var uri;
  ForEach.texture(gltf, function(texture, id) {
    var imageId = texture.source;

    if (
      defined(texture.extensions) &&
      defined(texture.extensions.EXT_texture_webp) &&
      supportsWebP
    ) {
      imageId = texture.extensions.EXT_texture_webp.source;
    }

    var gltfImage = images[imageId];
    var extras = gltfImage.extras;

    var bufferViewId = gltfImage.bufferView;
    var mimeType = gltfImage.mimeType;
    uri = gltfImage.uri;

    // First check for a compressed texture
    if (defined(extras) && defined(extras.compressedImage3DTiles)) {
      var crunch = extras.compressedImage3DTiles.crunch;
      var s3tc = extras.compressedImage3DTiles.s3tc;
      var pvrtc = extras.compressedImage3DTiles.pvrtc1;
      var etc1 = extras.compressedImage3DTiles.etc1;

      if (context.s3tc && defined(crunch)) {
        mimeType = crunch.mimeType;
        if (defined(crunch.bufferView)) {
          bufferViewId = crunch.bufferView;
        } else {
          uri = crunch.uri;
        }
      } else if (context.s3tc && defined(s3tc)) {
        mimeType = s3tc.mimeType;
        if (defined(s3tc.bufferView)) {
          bufferViewId = s3tc.bufferView;
        } else {
          uri = s3tc.uri;
        }
      } else if (context.pvrtc && defined(pvrtc)) {
        mimeType = pvrtc.mimeType;
        if (defined(pvrtc.bufferView)) {
          bufferViewId = pvrtc.bufferView;
        } else {
          uri = pvrtc.uri;
        }
      } else if (context.etc1 && defined(etc1)) {
        mimeType = etc1.mimeType;
        if (defined(etc1.bufferView)) {
          bufferViewId = etc1.bufferView;
        } else {
          uri = etc1.uri;
        }
      }
    }

    // Image references either uri (external or base64-encoded) or bufferView
    if (defined(bufferViewId)) {
      model._loadResources.texturesToCreateFromBufferView.enqueue({
        id: id,
        image: undefined,
        bufferView: bufferViewId,
        mimeType: mimeType,
      });
    } else {
      ++model._loadResources.pendingTextureLoads;

      var imageResource = model._resource.getDerivedResource({
        url: uri,
      });

      var promise;
      if (ktxRegex.test(uri)) {
        promise = loadKTX(imageResource);
      } else if (crnRegex.test(uri)) {
        promise = loadCRN(imageResource);
      } else {
        promise = imageResource.fetchImage();
      }
      promise
        .then(imageLoad(model, id, imageId))
        .otherwise(
          ModelUtility.getFailedLoadFunction(model, "image", imageResource.url)
        );
    }
  });
}

var scratchArticulationStageInitialTransform = new Matrix4();

function parseNodes(model) {
  var runtimeNodes = {};
  var runtimeNodesByName = {};
  var skinnedNodes = [];

  var skinnedNodesIds = model._loadResources.skinnedNodesIds;
  var articulationsByName = model._runtime.articulationsByName;

  ForEach.node(model.gltf, function(node, id) {
    var runtimeNode = {
      // Animation targets
      matrix: undefined,
      translation: undefined,
      rotation: undefined,
      scale: undefined,

      // Per-node show inherited from parent
      computedShow: true,

      // Computed transforms
      transformToRoot: new Matrix4(),
      computedMatrix: new Matrix4(),
      dirtyNumber: 0, // The frame this node was made dirty by an animation; for graph traversal

      // Rendering
      commands: [], // empty for transform, light, and camera nodes

      // Skinned node
      inverseBindMatrices: undefined, // undefined when node is not skinned
      bindShapeMatrix: undefined, // undefined when node is not skinned or identity
      joints: [], // empty when node is not skinned
      computedJointMatrices: [], // empty when node is not skinned

      // Joint node
      jointName: node.jointName, // undefined when node is not a joint

      weights: [],

      // Graph pointers
      children: [], // empty for leaf nodes
      parents: [], // empty for root nodes

      // Publicly-accessible ModelNode instance to modify animation targets
      publicNode: undefined,
    };
    runtimeNode.publicNode = new ModelNode(
      model,
      node,
      runtimeNode,
      id,
      ModelUtility.getTransform(node)
    );

    runtimeNodes[id] = runtimeNode;
    runtimeNodesByName[node.name] = runtimeNode;

    if (defined(node.skin)) {
      skinnedNodesIds.push(id);
      skinnedNodes.push(runtimeNode);
    }

    if (
      defined(node.extensions) &&
      defined(node.extensions.AGI_articulations)
    ) {
      var articulationName = node.extensions.AGI_articulations.articulationName;
      if (defined(articulationName)) {
        var transform = Matrix4.clone(
          runtimeNode.publicNode.originalMatrix,
          scratchArticulationStageInitialTransform
        );
        var articulation = articulationsByName[articulationName];
        articulation.nodes.push(runtimeNode.publicNode);

        var numStages = articulation.stages.length;
        for (var s = 0; s < numStages; ++s) {
          var stage = articulation.stages[s];
          transform = applyArticulationStageMatrix(stage, transform);
        }
        runtimeNode.publicNode.matrix = transform;
      }
    }
  });

  model._runtime.nodes = runtimeNodes;
  model._runtime.nodesByName = runtimeNodesByName;
  model._runtime.skinnedNodes = skinnedNodes;
}

function parseMaterials(model) {
  var gltf = model.gltf;
  var techniques = model._sourceTechniques;

  var runtimeMaterialsByName = {};
  var runtimeMaterialsById = {};
  var uniformMaps = model._uniformMaps;

  ForEach.material(gltf, function(material, materialId) {
    // Allocated now so ModelMaterial can keep a reference to it.
    uniformMaps[materialId] = {
      uniformMap: undefined,
      values: undefined,
      jointMatrixUniformName: undefined,
      morphWeightsUniformName: undefined,
    };

    var modelMaterial = new ModelMaterial(model, material, materialId);

    if (
      defined(material.extensions) &&
      defined(material.extensions.KHR_techniques_webgl)
    ) {
      var techniqueId = material.extensions.KHR_techniques_webgl.technique;
      modelMaterial._technique = techniqueId;
      modelMaterial._program = techniques[techniqueId].program;

      ForEach.materialValue(material, function(value, uniformName) {
        if (!defined(modelMaterial._values)) {
          modelMaterial._values = {};
        }

        modelMaterial._values[uniformName] = clone(value);
      });
    }

    runtimeMaterialsByName[material.name] = modelMaterial;
    runtimeMaterialsById[materialId] = modelMaterial;
  });

  model._runtime.materialsByName = runtimeMaterialsByName;
  model._runtime.materialsById = runtimeMaterialsById;
}

function parseMeshes(model) {
  var runtimeMeshesByName = {};
  var runtimeMaterialsById = model._runtime.materialsById;

  ForEach.mesh(model.gltf, function(mesh, meshId) {
    runtimeMeshesByName[mesh.name] = new ModelMesh(
      mesh,
      runtimeMaterialsById,
      meshId
    );
    if (
      defined(model.extensionsUsed.WEB3D_quantized_attributes) ||
      model._dequantizeInShader
    ) {
      // Cache primitives according to their program
      ForEach.meshPrimitive(mesh, function(primitive, primitiveId) {
        var programId = getProgramForPrimitive(model, primitive);
        var programPrimitives = model._programPrimitives[programId];
        if (!defined(programPrimitives)) {
          programPrimitives = {};
          model._programPrimitives[programId] = programPrimitives;
        }
        programPrimitives[meshId + ".primitive." + primitiveId] = primitive;
      });
    }
  });

  model._runtime.meshesByName = runtimeMeshesByName;
}
Model.prototype.update = function(frameState) {
  if (frameState.mode === SceneMode.MORPHING) {
    return;
  }

  if (!FeatureDetection.supportsWebP.initialized) {
    FeatureDetection.supportsWebP.initialize();
    return;
  }
  var supportsWebP = FeatureDetection.supportsWebP();

  var context = frameState.context;
  this._defaultTexture = context.defaultTexture;

  if (this._state === ModelState.NEEDS_LOAD && defined(this.gltf)) {
    // Use renderer resources from cache instead of loading/creating them?
    var cachedRendererResources;
    var cacheKey = this.cacheKey;
    if (defined(cacheKey)) {
      // cache key given? this model will pull from or contribute to context level cache
      context.cache.modelRendererResourceCache = defaultValue(
        context.cache.modelRendererResourceCache, {}
      );
      var modelCaches = context.cache.modelRendererResourceCache;

      cachedRendererResources = modelCaches[this.cacheKey];
      if (defined(cachedRendererResources)) {
        if (!cachedRendererResources.ready) {
          // Cached resources for the model are not loaded yet.  We'll
          // try again every frame until they are.
          return;
        }

        ++cachedRendererResources.count;
        this._loadRendererResourcesFromCache = true;
      } else {
        cachedRendererResources = new CachedRendererResources(
          context,
          cacheKey
        );
        cachedRendererResources.count = 1;
        modelCaches[this.cacheKey] = cachedRendererResources;
      }
      this._cachedRendererResources = cachedRendererResources;
    } else {
      // cache key not given? this model doesn't care about context level cache at all. Cache is here to simplify freeing on destroy.
      cachedRendererResources = new CachedRendererResources(context);
      cachedRendererResources.count = 1;
      this._cachedRendererResources = cachedRendererResources;
    }

    this._state = ModelState.LOADING;
    if (this._state !== ModelState.FAILED) {
      var extensions = this.gltf.extensions;
      if (defined(extensions) && defined(extensions.CESIUM_RTC)) {
        var center = Cartesian3.fromArray(extensions.CESIUM_RTC.center);
        if (!Cartesian3.equals(center, Cartesian3.ZERO)) {
          this._rtcCenter3D = center;

          var projection = frameState.mapProjection;
          var ellipsoid = projection.ellipsoid;
          var cartographic = ellipsoid.cartesianToCartographic(
            this._rtcCenter3D
          );
          var projectedCart = projection.project(cartographic);
          Cartesian3.fromElements(
            projectedCart.z,
            projectedCart.x,
            projectedCart.y,
            projectedCart
          );
          this._rtcCenter2D = projectedCart;

          this._rtcCenterEye = new Cartesian3();
          this._rtcCenter = this._rtcCenter3D;
        }
      }

      addPipelineExtras(this.gltf);

      this._loadResources = new ModelLoadResources();
      if (!this._loadRendererResourcesFromCache) {
        // Buffers are required to updateVersion
        ModelUtility.parseBuffers(this, bufferLoad);
      }
    }
  }

  var loadResources = this._loadResources;
  var incrementallyLoadTextures = this._incrementallyLoadTextures;
  var justLoaded = false;

  if (this._state === ModelState.LOADING) {
    // Transition from LOADING -> LOADED once resources are downloaded and created.
    // Textures may continue to stream in while in the LOADED state.
    if (loadResources.pendingBufferLoads === 0) {
      if (!loadResources.initialized) {
        frameState.brdfLutGenerator.update(frameState);

        ModelUtility.checkSupportedExtensions(
          this.extensionsRequired,
          supportsWebP
        );
        ModelUtility.updateForwardAxis(this);

        // glTF pipeline updates, not needed if loading from cache
        if (!defined(this.gltf.extras.sourceVersion)) {
          var gltf = this.gltf;
          // Add the original version so it remains cached
          gltf.extras.sourceVersion = ModelUtility.getAssetVersion(gltf);
          gltf.extras.sourceKHRTechniquesWebGL = defined(
            ModelUtility.getUsedExtensions(gltf).KHR_techniques_webgl
          );

          this._sourceVersion = gltf.extras.sourceVersion;
          this._sourceKHRTechniquesWebGL = gltf.extras.sourceKHRTechniquesWebGL;

          updateVersion(gltf);
          addDefaults(gltf);

          var options = {
            addBatchIdToGeneratedShaders: this._addBatchIdToGeneratedShaders,
          };

          processModelMaterialsCommon(gltf, options);
          processPbrMaterials(gltf, options);
        }

        this._sourceVersion = this.gltf.extras.sourceVersion;
        this._sourceKHRTechniquesWebGL = this.gltf.extras.sourceKHRTechniquesWebGL;

        // Skip dequantizing in the shader if not encoded
        this._dequantizeInShader =
          this._dequantizeInShader && DracoLoader.hasExtension(this);

        // We do this after to make sure that the ids don't change
        addBuffersToLoadResources(this);
        parseArticulations(this);
        parseTechniques(this);
        if (!this._loadRendererResourcesFromCache) {
          parseBufferViews(this);
          parseShaders(this);
          parsePrograms(this);
          parseTextures(this, context, supportsWebP);
        }
        parseMaterials(this);
        parseMeshes(this);
        parseNodes(this);

        // Start draco decoding
        DracoLoader.parse(this, context);

        loadResources.initialized = true;
      }

      if (!loadResources.finishedDecoding()) {
        DracoLoader.decodeModel(this, context).otherwise(
          ModelUtility.getFailedLoadFunction(this, "model", this.basePath)
        );
      }

      if (loadResources.finishedDecoding() && !loadResources.resourcesParsed) {
        this._boundingSphere = ModelUtility.computeBoundingSphere(this);
        this._initialRadius = this._boundingSphere.radius;

        DracoLoader.cacheDataForModel(this);

        loadResources.resourcesParsed = true;
      }

      if (
        loadResources.resourcesParsed &&
        loadResources.pendingShaderLoads === 0
      ) {
        ModelOutlineLoader.outlinePrimitives(this);
        createResources(this, frameState);
      }
    }

    if (
      loadResources.finished() ||
      (incrementallyLoadTextures &&
        loadResources.finishedEverythingButTextureCreation())
    ) {
      this._state = ModelState.LOADED;
      justLoaded = true;
    }
  }

  // Incrementally stream textures.
  if (defined(loadResources) && this._state === ModelState.LOADED) {
    if (incrementallyLoadTextures && !justLoaded) {
      createResources(this, frameState);
    }

    if (loadResources.finished()) {
      this._loadResources = undefined; // Clear CPU memory since WebGL resources were created.

      var resources = this._rendererResources;
      var cachedResources = this._cachedRendererResources;

      cachedResources.buffers = resources.buffers;
      cachedResources.vertexArrays = resources.vertexArrays;
      cachedResources.programs = resources.programs;
      cachedResources.sourceShaders = resources.sourceShaders;
      cachedResources.silhouettePrograms = resources.silhouettePrograms;
      cachedResources.textures = resources.textures;
      cachedResources.samplers = resources.samplers;
      cachedResources.renderStates = resources.renderStates;
      cachedResources.ready = true;

      // The normal attribute name is required for silhouettes, so get it before the gltf JSON is released
      this._normalAttributeName = ModelUtility.getAttributeOrUniformBySemantic(
        this.gltf,
        "NORMAL"
      );

      // Vertex arrays are unique to this model, do not store in cache.
      if (defined(this._precreatedAttributes)) {
        cachedResources.vertexArrays = {};
      }

      if (this.releaseGltfJson) {
        releaseCachedGltf(this);
      }
    }
  }

  var iblSupported = OctahedralProjectedCubeMap.isSupported(context);
  if (this._shouldUpdateSpecularMapAtlas && iblSupported) {
    this._shouldUpdateSpecularMapAtlas = false;
    this._specularEnvironmentMapAtlas =
      this._specularEnvironmentMapAtlas &&
      this._specularEnvironmentMapAtlas.destroy();
    this._specularEnvironmentMapAtlas = undefined;
    if (defined(this._specularEnvironmentMaps)) {
      this._specularEnvironmentMapAtlas = new OctahedralProjectedCubeMap(
        this._specularEnvironmentMaps
      );
      var that = this;
      this._specularEnvironmentMapAtlas.readyPromise
        .then(function() {
          that._shouldRegenerateShaders = true;
        })
        .otherwise(function(error) {
          console.error("Error loading specularEnvironmentMaps: " + error);
        });
    }

    // Regenerate shaders to not use an environment map. Will be set to true again if there was a new environment map and it is ready.
    this._shouldRegenerateShaders = true;
  }

  if (defined(this._specularEnvironmentMapAtlas)) {
    this._specularEnvironmentMapAtlas.update(frameState);
  }

  var recompileWithDefaultAtlas = !defined(this._specularEnvironmentMapAtlas) &&
    defined(frameState.specularEnvironmentMaps) &&
    !this._useDefaultSpecularMaps;
  var recompileWithoutDefaultAtlas = !defined(frameState.specularEnvironmentMaps) &&
    this._useDefaultSpecularMaps;

  var recompileWithDefaultSHCoeffs = !defined(this._sphericalHarmonicCoefficients) &&
    defined(frameState.sphericalHarmonicCoefficients) &&
    !this._useDefaultSphericalHarmonics;
  var recompileWithoutDefaultSHCoeffs = !defined(frameState.sphericalHarmonicCoefficients) &&
    this._useDefaultSphericalHarmonics;

  this._shouldRegenerateShaders =
    this._shouldRegenerateShaders ||
    recompileWithDefaultAtlas ||
    recompileWithoutDefaultAtlas ||
    recompileWithDefaultSHCoeffs ||
    recompileWithoutDefaultSHCoeffs;

  this._useDefaultSpecularMaps = !defined(this._specularEnvironmentMapAtlas) &&
    defined(frameState.specularEnvironmentMaps);
  this._useDefaultSphericalHarmonics = !defined(this._sphericalHarmonicCoefficients) &&
    defined(frameState.sphericalHarmonicCoefficients);

  var silhouette = hasSilhouette(this, frameState);
  var translucent = isTranslucent(this);
  var invisible = isInvisible(this);
  var backFaceCulling = this.backFaceCulling;
  var displayConditionPassed = defined(this.distanceDisplayCondition) ?
    distanceDisplayConditionVisible(this, frameState) :
    true;
  var show =
    this.show &&
    displayConditionPassed &&
    this.scale !== 0.0 &&
    (!invisible || silhouette);

  if ((show && this._state === ModelState.LOADED) || justLoaded) {
    var animated =
      this.activeAnimations.update(frameState) || this._cesiumAnimationsDirty;
    this._cesiumAnimationsDirty = false;
    this._dirty = false;
    var modelMatrix = this.modelMatrix;

    var modeChanged = frameState.mode !== this._mode;
    this._mode = frameState.mode;

    // Model's model matrix needs to be updated
    var modelTransformChanged = !Matrix4.equals(this._modelMatrix, modelMatrix) ||
      this._scale !== this.scale ||
      this._minimumPixelSize !== this.minimumPixelSize ||
      this.minimumPixelSize !== 0.0 || // Minimum pixel size changed or is enabled
      this._maximumScale !== this.maximumScale ||
      this._heightReference !== this.heightReference ||
      this._heightChanged ||
      modeChanged;

    if (modelTransformChanged || justLoaded) {
      Matrix4.clone(modelMatrix, this._modelMatrix);

      updateClamping(this);

      if (defined(this._clampedModelMatrix)) {
        modelMatrix = this._clampedModelMatrix;
      }

      this._scale = this.scale;
      this._minimumPixelSize = this.minimumPixelSize;
      this._maximumScale = this.maximumScale;
      this._heightReference = this.heightReference;
      this._heightChanged = false;

      var scale = getScale(this, frameState);
      var computedModelMatrix = this._computedModelMatrix;
      Matrix4.multiplyByUniformScale(modelMatrix, scale, computedModelMatrix);
      if (this._upAxis === Axis.Y) {
        Matrix4.multiplyTransformation(
          computedModelMatrix,
          Axis.Y_UP_TO_Z_UP,
          computedModelMatrix
        );
      } else if (this._upAxis === Axis.X) {
        Matrix4.multiplyTransformation(
          computedModelMatrix,
          Axis.X_UP_TO_Z_UP,
          computedModelMatrix
        );
      }
      if (this.forwardAxis === Axis.Z) {
        // glTF 2.0 has a Z-forward convention that must be adapted here to X-forward.
        Matrix4.multiplyTransformation(
          computedModelMatrix,
          Axis.Z_UP_TO_X_UP,
          computedModelMatrix
        );
      }
    }

    // Update modelMatrix throughout the graph as needed
    if (animated || modelTransformChanged || justLoaded) {
      updateNodeHierarchyModelMatrix(
        this,
        modelTransformChanged,
        justLoaded,
        frameState.mapProjection
      );
      this._dirty = true;

      if (animated || justLoaded) {
        // Apply skins if animation changed any node transforms
        applySkins(this);
      }
    }

    if (this._perNodeShowDirty) {
      this._perNodeShowDirty = false;
      updatePerNodeShow(this);
    }
    updatePickIds(this, context);
    updateWireframe(this);
    updateShowBoundingVolume(this);
    updateShadows(this);
    updateClippingPlanes(this, frameState);

    // Regenerate shaders if ClippingPlaneCollection state changed or it was removed
    var clippingPlanes = this._clippingPlanes;
    var currentClippingPlanesState = 0;
    var useClippingPlanes =
      defined(clippingPlanes) &&
      clippingPlanes.enabled &&
      clippingPlanes.length > 0;
    var usesSH =
      defined(this._sphericalHarmonicCoefficients) ||
      this._useDefaultSphericalHarmonics;
    var usesSM =
      (defined(this._specularEnvironmentMapAtlas) &&
        this._specularEnvironmentMapAtlas.ready) ||
      this._useDefaultSpecularMaps;
    if (useClippingPlanes || usesSH || usesSM) {
      var clippingPlanesOriginMatrix = defaultValue(
        this.clippingPlanesOriginMatrix,
        modelMatrix
      );
      Matrix4.multiply(
        context.uniformState.view3D,
        clippingPlanesOriginMatrix,
        this._clippingPlaneModelViewMatrix
      );
    }

    if (useClippingPlanes) {
      currentClippingPlanesState = clippingPlanes.clippingPlanesState;
    }

    var shouldRegenerateShaders = this._shouldRegenerateShaders;
    shouldRegenerateShaders =
      shouldRegenerateShaders ||
      this._clippingPlanesState !== currentClippingPlanesState;
    this._clippingPlanesState = currentClippingPlanesState;

    // Regenerate shaders if color shading changed from last update
    var currentlyColorShadingEnabled = isColorShadingEnabled(this);
    if (currentlyColorShadingEnabled !== this._colorShadingEnabled) {
      this._colorShadingEnabled = currentlyColorShadingEnabled;
      shouldRegenerateShaders = true;
    }
    const key = this._resource.request.url;
    let changed = false;
    if (cachedShader.has(key) && cachedShader.get(key).changed) {
      changed = true;
      this._shouldRegenerateShaders = true;
    }
    if (shouldRegenerateShaders || changed) {
      regenerateShaders(this, frameState);
      changed = false;
    } else {
      updateColor(this, frameState, false);
      updateBackFaceCulling(this, frameState, false);
      updateSilhouette(this, frameState, false);
    }
  }

  if (justLoaded) {
    // Called after modelMatrix update.
    var model = this;
    frameState.afterRender.push(function() {
      model._ready = true;
      model._readyPromise.resolve(model);
    });
    return;
  }

  // We don't check show at the top of the function since we
  // want to be able to progressively load models when they are not shown,
  // and then have them visible immediately when show is set to true.
  if (show && !this._ignoreCommands) {
    // PERFORMANCE_IDEA: This is terrible
    var commandList = frameState.commandList;
    var passes = frameState.passes;
    var nodeCommands = this._nodeCommands;
    var length = nodeCommands.length;
    var i;
    var nc;

    var idl2D =
      frameState.mapProjection.ellipsoid.maximumRadius * CesiumMath.PI;
    var boundingVolume;

    if (passes.render || (passes.pick && this.allowPicking)) {
      for (i = 0; i < length; ++i) {
        nc = nodeCommands[i];
        if (nc.show) {
          var command = nc.command;
          if (silhouette) {
            command = nc.silhouetteModelCommand;
          } else if (translucent) {
            command = nc.translucentCommand;
          } else if (!backFaceCulling) {
            command = nc.disableCullingCommand;
          }
          commandList.push(command);
          boundingVolume = nc.command.boundingVolume;
          if (
            frameState.mode === SceneMode.SCENE2D &&
            (boundingVolume.center.y + boundingVolume.radius > idl2D ||
              boundingVolume.center.y - boundingVolume.radius < idl2D)
          ) {
            var command2D = nc.command2D;
            if (silhouette) {
              command2D = nc.silhouetteModelCommand2D;
            } else if (translucent) {
              command2D = nc.translucentCommand2D;
            } else if (!backFaceCulling) {
              command2D = nc.disableCullingCommand2D;
            }
            commandList.push(command2D);
          }
        }
      }

      if (silhouette && !passes.pick) {
        // Render second silhouette pass
        for (i = 0; i < length; ++i) {
          nc = nodeCommands[i];
          if (nc.show) {
            commandList.push(nc.silhouetteColorCommand);
            boundingVolume = nc.command.boundingVolume;
            if (
              frameState.mode === SceneMode.SCENE2D &&
              (boundingVolume.center.y + boundingVolume.radius > idl2D ||
                boundingVolume.center.y - boundingVolume.radius < idl2D)
            ) {
              commandList.push(nc.silhouetteColorCommand2D);
            }
          }
        }
      }
    }
  }

  var credit = this._credit;
  if (defined(credit)) {
    frameState.creditDisplay.addCredit(credit);
  }

  var resourceCredits = this._resourceCredits;
  var creditCount = resourceCredits.length;
  for (var c = 0; c < creditCount; c++) {
    frameState.creditDisplay.addCredit(resourceCredits[c]);
  }
};

function destroyIfNotCached(rendererResources, cachedRendererResources) {
  if (rendererResources.programs !== cachedRendererResources.programs) {
    destroy(rendererResources.programs);
  }
  if (
    rendererResources.silhouettePrograms !==
    cachedRendererResources.silhouettePrograms
  ) {
    destroy(rendererResources.silhouettePrograms);
  }
}

// Run from update iff:
// - everything is loaded
// - clipping planes state change OR color state set
// Run this from destructor after removing color state and clipping plane state
function regenerateShaders(model, frameState) {
  // In regards to _cachedRendererResources:
  // Fair to assume that this is data that should just never get modified due to clipping planes or model color.
  // So if clipping planes or model color active:
  // - delink _rendererResources.*programs and create new dictionaries.
  // - do NOT destroy any programs - might be used by copies of the model or by might be needed in the future if clipping planes/model color is deactivated

  // If clipping planes and model color inactive:
  // - destroy _rendererResources.*programs
  // - relink _rendererResources.*programs to _cachedRendererResources

  // In both cases, need to mark commands as dirty, re-run derived commands (elsewhere)

  var rendererResources = model._rendererResources;
  var cachedRendererResources = model._cachedRendererResources;
  destroyIfNotCached(rendererResources, cachedRendererResources);

  var programId;
  if (
    isClippingEnabled(model) ||
    isColorShadingEnabled(model) ||
    model._shouldRegenerateShaders
  ) {
    model._shouldRegenerateShaders = false;

    rendererResources.programs = {};
    rendererResources.silhouettePrograms = {};

    var visitedPrograms = {};
    var techniques = model._sourceTechniques;
    var technique;

    for (var techniqueId in techniques) {
      if (techniques.hasOwnProperty(techniqueId)) {
        technique = techniques[techniqueId];
        programId = technique.program;
        if (!visitedPrograms[programId]) {
          visitedPrograms[programId] = true;
          recreateProgram({
              programId: programId,
              techniqueId: techniqueId,
            },
            model,
            frameState.context
          );
        }
      }
    }
  } else {
    rendererResources.programs = cachedRendererResources.programs;
    rendererResources.silhouettePrograms =
      cachedRendererResources.silhouettePrograms;
  }

  // Fix all the commands, marking them as dirty so everything that derives will re-derive
  var rendererPrograms = rendererResources.programs;

  var nodeCommands = model._nodeCommands;
  var commandCount = nodeCommands.length;
  for (var i = 0; i < commandCount; ++i) {
    var nodeCommand = nodeCommands[i];
    programId = nodeCommand.programId;

    var renderProgram = rendererPrograms[programId];
    nodeCommand.command.shaderProgram = renderProgram;
    if (defined(nodeCommand.command2D)) {
      nodeCommand.command2D.shaderProgram = renderProgram;
    }
  }

  // Force update silhouette commands/shaders
  updateColor(model, frameState, true);
  updateBackFaceCulling(model, frameState, true);
  updateSilhouette(model, frameState, true);
}

export default Model;

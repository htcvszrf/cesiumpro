import defaultValue from './defaultValue';
import defined from './defined';
import CesiumProError from './CesiumProError'
import URL from './URL';
import fs from '../shader/waterFaceFS';
import vs from '../shader/waterFaceVS';
import checkViewer from './checkViewer'
const {
  Color,
  Resource,
  Texture,
  TextureWrap,
  Sampler,
  Cartographic,
  Cartesian2,
  Cartesian3,
  Camera,
  Framebuffer,
  Renderbuffer,
  PassState,
  BoundingRectangle,
  PixelFormat,
  RenderbufferFormat,
  Matrix4,
  Matrix3,
  JulianDate,
  ShaderProgram,
  RenderState,
  PolygonGeometry,
  Buffer,
  BufferUsage,
  IndexDatatype,
  ComponentDatatype,
  VertexArray,
  DrawCommand,
  PrimitiveType,
  Pass,
  Plane,
  Cartesian4,
  ClearCommand,
  Primitive,
  destroyObject,
  ShaderSource
} = Cesium;

const CesiumMath = Cesium.Math;

function executeCommand(command, scene, context, passState, debugFramebuffer) {
  var frameState = scene._frameState;

  if (defined(scene.debugCommandFilter) && !scene.debugCommandFilter(command)) {
    return;
  }

  if (command instanceof ClearCommand) {
    command.execute(context, passState);
    return;
  }

  // if (command.debugShowBoundingVolume && defined(command.boundingVolume)) {
  //   debugShowBoundingVolume(command, scene, passState, debugFramebuffer);
  // }

  if (frameState.useLogDepth && defined(command.derivedCommands.logDepth)) {
    command = command.derivedCommands.logDepth.command;
  }

  var passes = frameState.passes;
  if (
    !passes.pick &&
    !passes.depth &&
    scene._hdr &&
    defined(command.derivedCommands) &&
    defined(command.derivedCommands.hdr)
  ) {
    command = command.derivedCommands.hdr.command;
  }

  if (passes.pick || passes.depth) {
    if (
      passes.pick &&
      !passes.depth &&
      defined(command.derivedCommands.picking)
    ) {
      command = command.derivedCommands.picking.pickCommand;
      command.execute(context, passState);
      return;
    } else if (defined(command.derivedCommands.depth)) {
      command = command.derivedCommands.depth.depthOnlyCommand;
      command.execute(context, passState);
      return;
    }
  }

  // if (scene.debugShowCommands || scene.debugShowFrustums) {
  //   executeDebugCommand(command, scene, passState);
  //   return;
  // }

  if (
    frameState.shadowState.lightShadowsEnabled &&
    command.receiveShadows &&
    defined(command.derivedCommands.shadows)
  ) {
    // If the command receives shadows, execute the derived shadows command.
    // Some commands, such as OIT derived commands, do not have derived shadow commands themselves
    // and instead shadowing is built-in. In this case execute the command regularly below.
    command.derivedCommands.shadows.receiveCommand.execute(context, passState);
  } else {
    command.execute(context, passState);
  }
}
class WaterFacePrimitive {
  /**
   * @see {@link https://www.cnblogs.com/wanghui2011/articles/13100925.html|基于Cesium实现逼真的水特效}
   * @param {Obejct} options [description]
   * @param {Cesium.Color} [options.waterColor=new Color(.439, .564, .788, 0)] 水颜色
   * @param {Cesium.Color} [options.refractColor=new Color(0,0,0,0)] 折射颜色
   * @param {Cesium.Color} [options.reflectColor=options.waterColor] 反射颜色
   *
   */
  constructor(options) {
    this._viewer = options.viewer;
    checkViewer(this._viewer);
    if (!defined(options.waterPolygon)) {
      throw new CesiumProError('parameter waterPolygon is required.')
    }
    this._waterColor = defaultValue(options.waterColor, new Color(0.439, 0.564, 0.788, 0));
    this._refractColor = defaultValue(options.refractColor, new Color(0, 0, 0, 0));
    this._reflectColor = defaultValue(options.reflectColor, this._waterColor);
    this._waveWidth = defaultValue(options.waveWidth, 5);
    this._flowDirection = defaultValue(options.flowDirection, 45);
    this._flowSpeed = defaultValue(options.flowSpeed, 0.6);
    this._waterPolygon = options.waterPolygon
    this._normalMap = defaultValue(options.normalMap, URL.buildModuleUrl('./assets/images/waterNormal.jpg'))
    this._normalTexture = undefined;
    this._startTime = 0;
    this._reflectCamera = undefined;
    this._reflectPassState = undefined;
    this._ready = false;
    this._drawCommand = undefined;
    this._show = defaultValue(options.show, true);
    this._context = viewer.scene._context;
    this._zFactor = 0;
    this._pointsToCartographic = []
    let img = document.createElement('img');
    Resource.fetchImage({
      url: this._normalMap
    }).then(resource => {
      img = resource;
      this._normalTexture = new Texture({
        context: this._context,
        width: img.width,
        height: img.height,
        source: img,
        sampler: new Sampler({
          wrapS: TextureWrap.REPEAT,
          wrapT: TextureWrap.REPAT
        })
      })
    })
    this.initialize()
  }
  /**
   * 定义水面范围
   * @type {Cesium.PolygonGeometry} 定义水面范围的多边形
   */
  get waterPolygon() {
    return this._waterPolygon;
  }
  set waterPolygon(v) {
    if (defined(v) && defined(this._waterPolygon)) {
      this.release();
    }
    this._waterPolygon = v;
  }
  /**
   * 流动速度
   * @type {Number} 流动速度
   */
  get flowSpeed() {
    return this._flowSpeed;
  }
  set flowSpeed(v) {
    this._flowSpeed = v;
  }

  get flowDirection() {
    return this._flowDirection;
  }
  set flowDirection(v) {
    this._flowDirection = v;
  }
  get waveWidth() {
    return this._waveWidth;
  }
  set waveWidth(val) {
    this._waveWidth = val;
  }
  get show() {
    return this._show;
  }
  set show(val) {
    this._show = val;
  }
  get waterColor() {
    return this._waterColor;
  }
  get refractColor() {
    return this._reflectColor;
  }
  get reflectColor() {
    return this._reflectColor;
  }
  /**
   * 计算水面的外接矩形
   * @private
   */
  computeBoundingRectangle() {
    const positions = this._waterPolygon._polygonHierarchy.positions;
    if (positions.length < 1) {
      throw new CesiumProError('The positions of water polygon hierarchy is empty.')
    }
    const firstCartographic = Cartographic.fromCartesian(positions[0]);
    let minX = CesiumMath.toDegrees(firstCartographic.longitude);
    let minY = CesiumMath.toDegrees(firstCartographic.latitude);
    let maxX = CesiumMath.toDegrees(firstCartographic.longitude);
    let maxY = CesiumMath.toDegrees(firstCartographic.latitude);
    this._zFactor = firstCartographic.height;
    for (let i = 0, length = positions.length; i < length; i++) {
      const cartographic = Cartographic.fromCartesian(positions[i]);
      const lon = CesiumMath.toDegrees(cartographic.longitude);
      const lat = CesiumMath.toDegrees(cartographic.latitude);
      const coordinate = new Cartesian2(lon, lat);
      this._pointsToCartographic.push(coordinate);
      if (lon > maxX) {
        maxX = lon;
      }
      if (lon < minX) {
        minX = lon;
      }
      if (lat > maxY) {
        maxY = lat;
      }
      if (lat < minY) {
        minY = lat;
      }
      this._lonMin = minX;
      this._latMin = minY;
      this._center = Cartesian3.fromDegrees((minX + maxX) / 2, (minY + maxY) / 2, this._zFactor);
    }
  }
  /**
   * 初始化入口
   * @private
   */
  initialize() {
    const context = this._context;
    if (!defined(this._reflectCamera)) {
      this._reflectCamera = new Camera(this._viewer.scene)
    }
    if (!defined(this._reflectPassState)) {
      const framebuffer = new Framebuffer({
        context,
        colorTextures: [new Texture({
          context,
          width: 512,
          height: 512,
          pixelFormat: PixelFormat.RGBA
        })],
        depthRenderbuffer: new Renderbuffer({
          context,
          format: RenderbufferFormat.DEPTH_COMPONENT16,
          width: 512,
          height: 512
        })
      })
      this._reflectPassState = new PassState(context);
      this._reflectPassState.viewport = new BoundingRectangle(0, 0, 512, 512);
      this._reflectPassState.framebuffer = framebuffer;
    }
    this._ready = true;
    this.computeBoundingRectangle();
  }
  update(frameState, time) {
    const scene = this._viewer.scene;
    const camera = this._viewer.camera;
    if (!this._ready) {
      this.initialize();
    }
    const context = this._context;
    this._fscale = 1 / (0.001 * this._waveWidth);
    const center = Cartesian3.clone(this._center);
    const cartographic = Cartographic.fromCartesian(center);
    const lon = CesiumMath.toDegrees(cartographic.longitude);
    const lat = CesiumMath.toDegrees(cartographic.latitude);
    const surface = Cartesian3.fromDegrees(lon, lat, 0);
    const normal = surface;
    Cartesian3.normalize(normal, normal);
    const north = new Cartesian3(0, 1, 0);
    const east = Cartesian3.cross(north, normal, new Cartesian3());
    Cartesian3.normalize(east, east);
    Cartesian3.cross(normal, east, north);
    const matrix = new Matrix3();
    Matrix3.setRow(matrix, 0, east, matrix);
    Matrix3.setRow(matrix, 1, north, matrix);
    Matrix3.setRow(matrix, 2, normal, matrix);
    const transpose = new Matrix3();
    Matrix3.transpose(matrix, transpose);
    const translation = new Cartesian3()
    const transposeCenter = new Cartesian3(-center.x, -center.y, -center.z);
    Matrix3.multiplyByVector(matrix, transposeCenter, translation);
    const invLocalViewMatrix = new Matrix4(matrix[0], matrix[3], matrix[6], translation.x,
      matrix[1], matrix[4], matrix[7], translation.y, matrix[2], matrix[5], matrix[8], translation.z, 0, 0, 0, 1);
    this.invWorldViewMatrix = new Matrix4();
    Matrix4.multiply(invLocalViewMatrix, camera.inverseViewMatrix, this.invWorldViewMatrix);
    this.modelMatrix = new Matrix4(1, 0, 0, center.x, 0, 1, 0, center.y, 0, 0, 1, center.z, 0, 0, 0, 1);
    this.modelViewMatrix = new Matrix4;
    this.modelViewProjection = new Matrix4;
    Matrix4.multiply(scene.camera.viewMatrix, this.modelMatrix, this.modelViewMatrix);
    Matrix4.multiply(scene.camera.frustum.projectionMatrix, this.modelViewMatrix, this.modelViewProjection);
    if (!defined(time)) {
      time = JulianDate.now();
    }
    if (this._startTime == 0) {
      this._startTime = time.secondsOfDay;
    }
    this._updated = false;
    const seconds = time.secondsOfDay;
    this._fElapse = (seconds - this._startTime);
    this._frameTime = this._fElapse * this._flowSpeed;
    this._flowAngle = CesiumMath.toRadians(this._flowDirection);
    if (!defined(this._drawCommand)) {
      const program = ShaderProgram.fromCache({
        context,
        vertexShaderSource: vs,
        fragmentShaderSource: fs,
      });
      const renderState = RenderState.fromCache({
        depthTest: {
          enabled: true
        }
      });
      const me = this;
      this._uniformMap = {
        u_bgColor: function() {
          return me.waterColor;
        },
        u_texCoordOffset: function() {
          return new Cartesian2(-me._lonMin, -me.latMin);
        },
        u_texCoordScale: function() {
          return new Cartesian2(me._fscale, me._fscale);
        },
        u_scale: function() {
          return new Cartesian3(3, 3, 3);
        },
        u_cameraPosition: function() {
          return new Cartesian3(3, 3, 3);
        },
        u_modelViewProjectionMatrix: function() {
          return me.modelViewProjection;
        },
        u_modelViewMatrix: function() {
          return me.modelViewMatrix;
        },
        u_clampToGroud: function() {
          return false;
        },
        u_invWorldViewMatrix: function() {
          return me.invWorldViewMatrix;
        },
        u_refractMap: function() {
          return me._normalTexture;
        },
        u_frameTime: function() {
          return me._frameTime;
        },
        u_normalMap: function() {
          return me._normalTexture
        },
        u_reflectMap: function() {
          return me._reflectPassState.framebuffer.getColorTexture(0);
        },
        u_useRefractTex: function() {
          return 0;
        },
        u_reflection: function() {
          return true;
        },
        u_waterColor: function() {
          return me._waterColor;
        },
        u_refractColor: function() {
          return me._refractColor;
        },
        u_reflectColor: function() {
          return me._reflectColor;
        },
        u_flowDirection: function() {
          return new Cartesian2(0.5 * Math.sin(me._flowAngle) + 0.5, 0.5 * Math.cos(me._flowAngle) + 0.5);
        }
      }
      this._waterGeometry = PolygonGeometry.createGeometry(this._waterPolygon);
      const indices = this._waterGeometry.indices;
      const positions = this._waterGeometry.attributes.position.values;
      for (let i = 0; i < positions.length; i++) {
        if (i % 3 === 0) {
          positions[i] = positions[i] - center.x;
        }
        if (i % 3 === 1) {
          positions[i] = positions[i] - center.y;
        }
        if (i % 3 === 2) {
          positions[i] = positions[i] - center.z;
        }
      }
      const cartographics = []
      for (let j = 0, length = this._pointsToCartographic.length; j < length; j++) {
        cartographics.push(this._pointsToCartographic[j]);
      }
      const indexBuffer = Buffer.createIndexBuffer({
        context,
        typedArray: new Uint32Array(indices),
        usage: BufferUsage.STATIC_DRAW,
        indexDatatype: IndexDatatype.UNSIGNED_INT
      });
      const vertexBuffer = Buffer.createVertexBuffer({
        context,
        typedArray: ComponentDatatype.createTypedArray(ComponentDatatype.FLOAT, positions),
        usage: BufferUsage.STATIC_DRAW,
      })
      const vertexBuffer1 = Buffer.createVertexBuffer({
        context,
        typedArray: ComponentDatatype.createTypedArray(ComponentDatatype.FLOAT, new Float64Array(cartographics)),
        usage: BufferUsage.STATIC_DRAW
      })
      const attributes = [{
        index: 0,
        vertexBuffer,
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        normalize: false
      }, {
        idnex: 1,
        vertexBuffer: vertexBuffer1,
        componentsPerAttribute: 2,
        normalize: false
      }]
      const vertexArray = new VertexArray({
        context,
        attributes,
        indexBuffer
      })
      this._drawCommand = new DrawCommand({
        boundingVolume: this._waterGeometry.boundingSphere,
        primitiveType: PrimitiveType.TRIANGLES,
        vertexArray,
        shaderProgram: program,
        castShadows: false,
        receiveShadows: false,
        uniformMap: this._uniformMap,
        renderState,
        pass: Pass.OPAQUE
      })
    }
    if (this._drawCommand) {
      frameState.commandList.push(this._drawCommand);
    }
    this._updated = true;
    // this.updateReflectTexture(frameState);
    // this.execute(frameState)
  }
  updateReflectTexture(frameState) {

    const camera = this._viewer.camera;
    if (this._updated) {
      const context = this._context;
      this.modelViewMatrix = Matrix4.multiply(camera.viewMatrix, this.modelMatrix, this.modelViewMatrix);
      this.modelViewProjection = Matrix4.multiply(camera.frustum.projectionMatrix, this.modelViewMatrix, this.modelViewProjection);
      const center = Cartesian3.clone(this._center);
      const normal = Cartesian3.clone(this._center);
      Cartesian3.normalize(normal, normal);
      const plane = Plane.fromPointNormal(center, normal);
      const normal1 = Cartesian3.clone(normal);
      const projectScale = -Cartesian3.dot(normal, center);
      const matrix = new Matrix4(
        -2 * normal.x * normal.x + 1, -2 * normal.x * normal.y, -2 * normal.x * normal.z, -2 * normal.x * projectScale,
        -2 * normal.y * normal.x, -2 * normal.y * normal.y + 1, -2 * normal.y * normal.z, -2 * normal.y * projectScale,
        -2 * normal.z * normal.x, -2 * normal.z * normal.y, -2 * normal.z * normal.z + 1, -2 * normal.z * projectScale,
        0, 0, 0, 1
      )
      const direction = new Cesium.Cartesian3();
      Cartesian3.clone(camera.direction, direction);
      const scaleNormal = new Cartesian3();
      Cartesian3.multiplyByScalar(normal, 2.0 * Cartesian3.dot(direction, normal), scaleNormal);
      const subtract = new Cartesian3()
      Cartesian3.subtract(direction, scaleNormal, subtract);
      Cartesian3.normalize(subtract, subtract);
      const up = new Cartesian3();
      Cartesian3.clone(camera.up, up);
      const scaleNormal2 = new Cartesian3();
      const cos = Cartesian3.dot(up, normal)
      Cartesian3.multiplyByScalar(normal, 2 * cos, scaleNormal2)
      const g = new Cartesian3();
      Cartesian3.add(up, scaleNormal2, g);
      Cartesian3.normalize(g, g);
      const cameraPos = Cartesian3.clone(camera.position);
      const worldPos = new Cartesian3();
      Matrix4.multiplyByPoint(matrix, cameraPos, worldPos);
      camera.frustum.fat = 1e8;
      const projectionMatrix = new Matrix4();
      Matrix4.clone(camera.frustum.projectionMatrix, projectionMatrix);
      this._reflectCamera.direction = subtract;
      if (cos < 0.5) {
        this._reflectCamera.up = new Cartesian3(-g.x, -g.y, -g.z);
      } else {
        this._reflectCamera.up = g;
      }
      this._reflectCamera.position = worldPos;
      const inverseMatrix = new Matrix4();
      Matrix4.inverse(this._reflectCamera.viewMatrix, inverseMatrix);
      Matrix4.transpose(inverseMatrix, inverseMatrix);
      const cartesian4 = new Cartesian4(plane.normal.x, plane.normal.y, plane.normal.z, -Cartesian3.dot(normal, center));
      Matrix4.multiplyByVector(inverseMatrix, cartesian4, cartesian4);
      const scale = cartesian4.w / Math.sqrt(cartesian4.x ** 2, cartesian4.y ** 2, cartesian4.z ** 2);
      const cartesian3 = new Cartesian3(cartesian4.x, cartesian4.y, cartesian4.z);
      Cartesian3.normalize(cartesian3, cartesian3);

      const cartesian4_1 = new Cartesian4();
      cartesian4_1.x = (Math.asin(cartesian3.x) + projectionMatrix[8]) / projectionMatrix[0];
      cartesian4_1.y = (Math.asin(cartesian3.y) + projectionMatrix[9] / projectionMatrix[5]);
      cartesian4_1.z = -1;
      cartesian4_1.w = (+projectionMatrix[10]) / projectionMatrix[14];
      const cartesian4_2 = new Cartesian4(cartesian3.x, cartesian3.y, cartesian3.z, scale);
      const scaleCartesian4_2 = new Cartesian4()
      Cartesian4.multiplyByScalar(cartesian4_2, 2 / Cartesian4.dot(cartesian4_2, cartesian4_1), scaleCartesian4_2);
      projectionMatrix[2] = scaleCartesian4_2.x;
      projectionMatrix[6] = scaleCartesian4_2.y;
      projectionMatrix[10] = scaleCartesian4_2.z + 1;
      projectionMatrix[14] = scaleCartesian4_2.w;
      Matrix4.clone(projectionMatrix, this._reflectCamera.frustum.projectionMatrix);
      const clear = new ClearCommand({
        color: Cesium.Color.fromBytes(14, 33, 60, 255),
        depth: 1,
        framebuffer: this._reflectPassState.framebuffer,
      })
      clear.execute(context, this._reflectPassState);
      this.renderColorTexture(frameState, clear, this._reflectPassState, this._reflectCamera)
    }
  }
  updateEnvironment(scene, passState) {
    //   const frameState = frameState._frameState,
    //     environmentState = frameState._environmentState,
    //     render = r.passes.render,
    //     skyAtmosphere = frameState.skyAtmosphere,
    //     globe = frameState.globe;
    //   if (!render || frameState._mode !== we.SCENE2D && r.camera.frustum instanceof D)
    //     environmentState.skyAtmosphereCommand =null,
    //     environmentState.skyBoxCommand =null,
    //     environmentState.sunDrawCommand =null,
    //     environmentState.sunComputeCommand =null,
    //     environmentState.moonCommand =null;
    //   else {
    //     h(skyAtmosphere) && h(globe) && (skyAtmosphere.setDynamicAtmosphereColor(globe.enableLighting),
    //         i.isReadyForAtmosphere = i.isReadyForAtmosphere || globe._surface._tilesToRender.length > 0),
    //       i.skyAtmosphereCommand = h(skyAtmosphere) ? skyAtmosphere.update(r) : void 0,
    //       i.skyBoxCommand = h(frameState.skyBox) ? frameState.skyBox.update(r) : void 0;
    //     var s = h(frameState.sun) ? frameState.sun.update(r, t) : void 0;
    //     i.sunDrawCommand = h(s) ? s.drawCommand : void 0,
    //       i.sunComputeCommand = h(s) ? s.computeCommand : void 0,
    //       i.moonCommand = h(frameState.moon) ? frameState.moon.update(r) : void 0
    //   }
    //   var l = i.clearGlobeDepth = h(globe) && (!globe.depthTestAgainstTerrain || frameState.mode === we.SCENE2D);
    //   (i.useDepthPlane = l && frameState.mode === we.SCENE3D) && frameState._depthPlane.update(r);
    //   for (var u = r.mode === we.SCENE3D ? r.occluder : void 0, c = r.cullingVolume, d = Rt.planes, p = 0; p < 5; ++p)
    //     d[p] = c.planes[p];
    //   c = Rt,
    //     i.isSkyAtmosphereVisible = h(i.skyAtmosphereCommand) && i.isReadyForAtmosphere,
    //     i.isSunVisible = ze(i.sunDrawCommand, c, u),
    //     i.isMoonVisible = ze(i.moonCommand, c, u)
  }
  renderColorTexture(frameState, command, passState, reflectCamera) {
    const context = this._context;
    const uniformState = context.uniformState;
    frameState.render = false;
    frameState.pick = false;
    frameState.depth = false;
    frameState.passes.render = true;
    const camera = frameState.camera;
    frameState.camera = reflectCamera;
    uniformState.updateCamera(reflectCamera);
    // at(this, passState);
    command.execute(context, passState);
    const commandList = frameState.commandList;
    const length = commandList.length;
    const environmentState = this._viewer.scene._environmentState;
    environmentState.isSkyAtmosphereVisible && executeCommand(environmentState.skyAtmosphereCommand, this._viewer.scene, context, passState);
    for (let c = 0; c < length; ++c) {
      const cmd = commandList[c];
      if (cmd.pass !== Pass.GLOBE && cmd.pass !== Pass.CESIUM_3D_TILE && cmd.pass !==
        Pass.OPAQUE && cmd.pass !== Pass.TRANSLUCENT && cmd.pass !== Pass.ENVIRONMENT && cmd.pass !== Pass.OVERLAY ||
        (uniformState.updatePass(cmd.pass))) {
        if (!defined(cmd.derivedCommands)) {
          continue;
        }
        executeCommand(cmd, this._viewer.scene, context, passState);
      }

    }
    uniformState.updateCamera(this._viewer.camera);
    uniformState.updateFrustum(this._viewer.camera.frustum);
    frameState.camera = camera;
  }
  execute(frameState) {
    if (this._normalTexture && this.show && this._updated) {
      this._viewer.scene.context.draw(this._drawCommand, frameState)
    }
  }
  release() {
    this._ready = false;
    this._waterPolygon = undefined;
    this._drawCommand = undefined;
    this._updated = false;
  }
  destroy() {
    if (this._drawCommand) {
      this._drawCommand = this._drawCommand && this._drawCommand.shaderProgram.destroy();
    }
    return destroyObject(this);
  }
  isDestroyed() {
    return false;
  }
}

export default WaterFacePrimitive

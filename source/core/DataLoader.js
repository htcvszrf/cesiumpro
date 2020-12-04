import CVT from './CVT'
/**
 * 各类数据加载
 * @exports DataLoader
 */
const DataLoader = {};

/**
 * 加载gltf/glb模型。
 * @param  {Cesium.Viewer} viewer  Cesium Viewer对象
 * @param  {Cesium.Cartesian3} [position=new Cesium.Cartesian3] 模型的位置,如果options中定义了modelMatrix，将覆盖该参数
 * @param  {Object} [options={}] 描述model的参数,同Cesium.Model.fromGltf
 * @return {Cesium.Cesium3DTileset}
 */
DataLoader.loadModel = function(viewer, position = new Cesium.Cartesian3(), options = {}) {
  if (!options.modelMatrix && position) {
    const matrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    options.modelMatrix = matrix;
  }
  const model = Cesium.Model.fromGltf(options)
  model.readyPromise.then(function(m) {
    // Play all animations when the model is ready to render
    m.activeAnimations.addAll({
      loop: Cesium.ModelAnimationLoop.REPEAT,
    });
  });
  return viewer.scene.primitives.add(model);
};

function rotate(tileset, rotation) {
  const transform = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotation));
  Cesium.Matrix4.multiplyByMatrix3(tileset.root.transform, transform, tileset.root.transform);
}

function transform(tileset, translation) {
  Cesium.Matrix4.multiplyByTranslation(tileset.modelMatrix, translation, tileset.modelMatrix);
}

function adjustHeight(tileset, height) {
  const {
    center
  } = tileset.boundingSphere;
  const coord = CVT.toDegrees(center, viewer);
  const surface = Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat, 0);
  const offset = Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat, height);
  const translation = Cesium.Cartesian3.subtract(
    offset,
    surface,
    new Cesium.Cartesian3(),
  );

  tileset.modelMatrix = Cesium.Matrix4.multiply(tileset.modelMatrix,
    Cesium.Matrix4.fromTranslation(translation), tileset.modelMatrix);
}

function adjustLocation(tileset, position, rtcCenterTransform) {
  const matrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  if (rtcCenterTransform) {
    const rtcCenter = Cesium.Matrix4.getTranslation(rtcCenterTransform, new Cesium.Cartesian3);
    const rtcMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(rtcCenter)
    const inverse = Cesium.Matrix4.inverseTransformation(rtcMatrix, new Cesium.Matrix4)
    Cesium.Matrix4.multiply(tileset.modelMatrix, inverse, tileset.modelMatrix);
    // const modelMatrix = Cesium.Matrix4.multiply(inverse, inverse, matrix);
    Cesium.Matrix4.multiply(matrix, tileset.modelMatrix, tileset.modelMatrix);
  } else {
    tileset.root.transform = matrix;
  }
}
const params = {
  height: 0,
  position: new Cesium.Cartesian3(0, 0, 0),
  rotation: 0
}
/**
 * 加载Cesium3dTileset
 * @param  {Cesium.Viewer} viewer
 * @param  {Object} [options={}] 描述一个Cesium3DTileset,和Cesium.Cesium3DTileset参数相同
 * @param  {Object} [kwargs={}]  具有以下属性
 * @param {Cesium.Cartesian3} [kwargs.position] 模型在场景中的位置
 * @param {Number} [kwargs.height] 模型高度
 * @param {Number} [kwargs.rotation] 模型绕Z轴旋转的角度,单位弧度
 * @param {Bool} [kwargs.debug] 是否开启调试模式,打开调试模式可能通过按键Q、E调整模型高度, A、D调整模型的经度，W、S调整模型纬度，Z、X调整模型角度
 * @param {Cesium.Matrix4} [options.rtcCenterTransform] 如果模型的中心位置不在玩心，则必须提供rtcCenterTransform，rtcCenterTransform可以通过tile.root.content._rtcCenterTransform获得
 * @return 返回一个Obejct，包含模型对象(tileset)和调整模型位置所需要的参数(parameters)
 * @example
 * const loader=CesiumPro.DataLoader.loadTileset(viewer,
 * {url:'http://...'},{height:10,debug:true});
 * //使用QWEASDZX按键调整模型位置后，调整模型位置所需的参数会保存在loader.parameters属性中
 * const params=loader.parameters;
 * const position=params.position;
 * const height=params.height;
 * const rotation=params.rotation;
 * //加载模型到正确的位置
 * CesiumPro.DataLoader.loadTileset(viewer,
 * {url:'http://...'},{height,position,rotation});
 *
 */
DataLoader.loadTileset = function(viewer, options = {}, kwargs = {}) {
  const {
    height,
    position,
    rotation,
    debug,
    rtcCenterTransform
  } = kwargs;
  const cesium3dtileset = new Cesium.Cesium3DTileset(options);
  cesium3dtileset.readyPromise.then((tileset) => {
    viewer.scene.primitives.add(tileset);
    if (Cesium.defined(position)) {
      adjustLocation(tileset, position, rtcCenterTransform);
    }
    if (Cesium.defined(height)) {
      adjustHeight(tileset, height);
    }
    if (debug) {
      params.height = height || 0;
      params.position = position || new Cesium.Cartesian3(0, 0, 0);
      params.rotation = rotation || 0;
      let height0, position0, rotation0;
      document.onkeypress = function(e) {
        // 升高
        if (e.keyCode === 'Q'.charCodeAt() || e.keyCode === 'q'.charCodeAt()) {
          height0 = 1;
        }
        // 降低
        else if (e.keyCode === 'E'.charCodeAt() || e.keyCode === 'e'.charCodeAt()) {
          height0 = -1;
        }
        // 平移
        else if (e.keyCode === 'A'.charCodeAt() || e.keyCode === 'a'.charCodeAt()) {
          position0 = new Cesium.Cartesian3(-2, 0, 0);
        } else if (e.keyCode === 'D'.charCodeAt() || e.keyCode === 'd'.charCodeAt()) {
          position0 = new Cesium.Cartesian3(2, 0, 0);
        } else if (e.keyCode === 'W'.charCodeAt() || e.keyCode === 'w'.charCodeAt()) {
          position0 = new Cesium.Cartesian3(0, -2, 0);
        } else if (e.keyCode === 'S'.charCodeAt() || e.keyCode === 's'.charCodeAt()) {
          position0 = new Cesium.Cartesian3(0, 2, 0);
        }
        // 旋转
        else if (e.keyCode === 'Z'.charCodeAt() || e.keyCode === 'z'.charCodeAt()) {
          rotation0 = -1;
        } else if (e.keyCode === 'X'.charCodeAt() || e.keyCode === 'x'.charCodeAt()) {
          rotation0 = 1;
        }
        if (Cesium.defined(height0)) {
          adjustHeight(tileset, height0);
          params.height += height0;
        }
        if (Cesium.defined(position0)) {
          transform(tileset, position0);
          params.position = Cesium.Cartesian3.add(params.position, position0, params.position);
        }
        if (Cesium.defined(rotation0)) {
          rotate(tileset, rotation0);
          params.rotation += rotation0;
        }
        rotation0 = undefined;
        position0 = undefined;
        height0 = undefined;
      };
    }
  });
  return {
    tileset: cesium3dtileset,
    parameters: params
  };
};
export default DataLoader;

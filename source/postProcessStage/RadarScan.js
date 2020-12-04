import defined from '../core/defined';
import defaultValue from '../core/defaultValue';
import PostProcessing from './PostProcessing'
import fs from '../shader/postProcessStage/radarScan'
class RadarScan extends PostProcessing {
  /**
   * @extends PostProcessing
   * @see {@link https://www.wellyyss.cn/ysCesium/main/main.html|雷达扫描}
   * @param {options} options 具有以下参数
   * @param {Cesium.Cartesian3} options.center 中心位置
   * @param {Cesium.Color} [options.color=Cesium.Color.RED] 颜色
   * @param {Cesium.duration} [options.duration=1000] 周期，单位毫秒
   * @param {Number} [options.radius] 扩展半径
   */
  constructor(options) {
    super(options);
    if (!defined(options.center)) {
      throw new Error('parameter center is required.')
    }
    this._center = options.center;
    this._color = defaultValue(options.color, new Cesium.Color(1.0, 0.0, 0.0, 1.0));
    this._radius = defaultValue(options.radius, 1000);
    this._duration = defaultValue(options.duration, 1000)
  }
  /**
   * 创建postProcessState
   * @override
   * @return {Cesium.postProcessState} postProcessState
   */
  createPostStage() {
    const {
      center,
      radius,
      color,
      duration
    } = this;
    const viewer = this._viewer
    const camera = viewer.camera;
    const Cartographic = Cesium.Cartographic
    const Cartesian3 = Cesium.Cartesian3;
    const toRadians = Cesium.Math.toRadians

    const cartographicCenter = Cartographic.fromCartesian(center);
    const cartographicCenter1 = new Cartographic(cartographicCenter.longitude,
      cartographicCenter.latitude, cartographicCenter.height + 500);
    const center1 = Cartesian3.fromRadians(cartographicCenter1.longitude,
      cartographicCenter1.latitude, cartographicCenter1.height);
    const cartographicCenter2 = new Cartographic(cartographicCenter.longitude + toRadians(0.001),
      cartographicCenter.latitude, cartographicCenter.height);
    const center2 = Cartesian3.fromRadians(cartographicCenter2.longitude,
      cartographicCenter2.latitude, cartographicCenter2.height);
    const rotateQ = new Cesium.Quaternion();
    const rotateM = new Cesium.Matrix3();
    const time = (new Date).getTime();
    const stratchCartesian3 = new Cartesian3();
    return new Cesium.PostProcessStage({
      fragmentShader: fs,
      uniforms: {
        u_center: this.center,
        u_planeNormal: Cartesian3.subtract(center, center1, new Cartesian3),
        radius: radius,
        u_lineNormal: function() {
          const tmp = Cesium.Matrix4.multiplyByPoint(camera._viewMatrix,
            center, new Cartesian3())
          const tmp1 = Cesium.Matrix4.multiplyByPoint(camera._viewMatrix,
            center1, new Cartesian3())
          const tmp2 = Cesium.Matrix4.multiplyByPoint(camera._viewMatrix,
            center2, new Cartesian3())
          const normal1 = Cartesian3.subtract(tmp, tmp1, tmp1);
          const normal2 = Cartesian3.subtract(tmp, tmp2, tmp2);
          const time1 = (((new Date()).getTime() - time) % duration) / duration;
          Cesium.Quaternion.fromAxisAngle(normal1, time1 * Math.PI * 2, rotateQ)
          Cesium.Matrix3.fromQuaternion(rotateQ, rotateM);
          Cesium.Matrix3.multiplyByVector(rotateM, normal2, normal2);
          Cartesian3.normalize(normal2, normal2)
          return normal2;
        },
        color: color
      }

    })
  }
  /**
   * 中心位置
   * @type {Cesium.Cartesian3}
   */
  get center() {
    return this._center;
  }
  set center(v) {
    this._center = v;
  }
  /**
   * 扩散半径
   * @type {Number}
   */
  get radius() {
    return this._radius;
  }
  set radius(v) {
    this._radius = v;
  }
  /**
   * 颜色
   * @type {Cesium.Color}
   */
  get color() {
    return this._color;
  }
  set color(v) {
    this._color = v;
  }
  /**
   * 动画周期，单位毫秒
   * @type {Number}
   */
  get duration() {
    return this._duration;
  }
  set duration(v) {
    this._duration = v;
  }

}
export default RadarScan;

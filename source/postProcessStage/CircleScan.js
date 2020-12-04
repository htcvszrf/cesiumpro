import fs from '../shader/postProcessStage/circleScan'
import PostProcessing from './PostProcessing'
import defaultValue from '../core/defaultValue';
import defined from '../core/defined'
class CircleScan extends PostProcessing {
  /**
   * @extends PostProcessing
   * @see {@link https://www.wellyyss.cn/ysCesium/main/main.html|圆形扫描}
   * @param {options} options 具有以下参数
   * @param {Cesium.Cartesian3} options.center 中心位置
   * @param {Cesium.Color} [options.color=Cesium.Color.RED] 颜色
   * @param {Cesium.duration} [options.duration=1000] 周期，单位毫秒
   * @param {Number} [options.radius] 扩展半径
   *
   */
  constructor(options) {
    super(options);
    if (!defined(options.center)) {
      throw new Error('parameter center is required.')
    }
    this._radius = defaultValue(options.radius, 1000);
    this._duration = defaultValue(options.duration, 1000);
    this._color = defaultValue(options.color, Cesium.Color.RED);
    this._center = options.center;
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
  /**
   * 创建postProcessState
   * @override
   * @return {Cesium.postProcessState} postProcessState
   */
  createPostStage() {
    const cartographicCenter = Cesium.Cartographic.fromCartesian(this.center)
    const maxRadius = this.radius
    const scanColor = this.color
    const duration = this.duration
    const _Cartesian3Center = Cesium.Cartographic.toCartesian(cartographicCenter);
    const _Cartesian4Center = new Cesium.Cartesian4(_Cartesian3Center.x, _Cartesian3Center.y, _Cartesian3Center.z, 1);
    const _CartographicCenter1 = new Cesium.Cartographic(cartographicCenter.longitude, cartographicCenter.latitude, cartographicCenter.height + 1);
    const _Cartesian3Center1 = Cesium.Cartographic.toCartesian(_CartographicCenter1);
    const _Cartesian4Center1 = new Cesium.Cartesian4(_Cartesian3Center1.x, _Cartesian3Center1.y, _Cartesian3Center1.z, 1);
    const _time = (new Date()).getTime();
    const _scratchCartesian4Center = new Cesium.Cartesian4();
    const _scratchCartesian4Center1 = new Cesium.Cartesian4();
    const _scratchCartesian3Normal = new Cesium.Cartesian3();
    this.scanPostStage = undefined
    const self = this;

    return new Cesium.PostProcessStage({
      fragmentShader: fs,
      uniforms: {
        center: function() {
          return Cesium.Matrix4.multiplyByVector(self.camera._viewMatrix, _Cartesian4Center, _scratchCartesian4Center);
        },
        normal: function() {
          const temp = Cesium.Matrix4.multiplyByVector(self.camera._viewMatrix, _Cartesian4Center, _scratchCartesian4Center);
          const temp1 = Cesium.Matrix4.multiplyByVector(self.camera._viewMatrix, _Cartesian4Center1, _scratchCartesian4Center1);
          _scratchCartesian3Normal.x = temp1.x - temp.x;
          _scratchCartesian3Normal.y = temp1.y - temp.y;
          _scratchCartesian3Normal.z = temp1.z - temp.z;
          Cesium.Cartesian3.normalize(_scratchCartesian3Normal, _scratchCartesian3Normal);
          return _scratchCartesian3Normal;

        },
        radius: function() {
          return maxRadius * (((new Date()).getTime() - _time) % duration) / duration;
        },
        color: scanColor
      }
    });
  }
}
export default CircleScan;

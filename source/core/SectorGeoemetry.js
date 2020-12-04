import defaultValue from './defaultValue';
import defined from './defined';
import CesiumProError from './CesiumProError';
const {
  VertexFormat,
  ArcType
} = Cesium;
class SectorGeometry {
  /**
   * 描述一个扇形几何体，
   * @param {Object} options 具有以下参数
   * @param {Cesium.Cartesian3} options.center 扇形的圆心位置
   * @param {Number} options.radius 扇形半径，单位米
   * @param {Number} options.fov 扇形开合角度，以正北方向为起点，正值逆时值旋转，单位弧度。
   */
  constructor(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);
    if (!defined(options.center)) {
      throw new CesiumProError('parameter center is required.')
    }
    if (!defined(options.radius)) {
      throw new CesiumProError('parameter radius is required.')
    }
    if (!defined(options.fov)) {
      throw new CesiumProError('parameter fov is required.');
    }
    this._center = options.center;
    this._radius = options.radius;
    this._fov = options.fov;
    this._vertexFormat = VertexFormat.clone(
      defaultValue(options.vertexFormat, VertexFormat.DEFAULT)
    );

    this._arcType = defaultValue(options.arcType, ArcType.GEODESIC);
    this._positions = undefined;
    this._workerName = "createSectorGeometry";
    this._rectangle = undefined;
  }
  /**
   * 扇形圆心坐标
   * @type Cesium.Cartesian3
   * @readonly
   */
  get center() {
    return this._center;
  }
  /**
   * 扇形半径
   * @type Number
   * @readonly
   */
  get radius() {
    return this._radius;
  }
  /**
   * 开合角
   * @type Number
   * @readonly
   */
  get fov() {
    return this._fov;
  }
  /**
   * 扇形顶点坐标
   * @type Cesium.Cartesian3[]
   * @readonly
   */
  get positions() {
    return this._positions;
  }
  /**
   * 顶点类型
   * @type Cesium.VertexFormat
   * @readonly
   */
  get vertexFormat() {
    return this._vertexFormat;
  }

}

export default SectorGeometry;

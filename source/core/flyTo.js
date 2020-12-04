import defined from './defined';
import CesiumProError from './CesiumProError'
/**
 * 场景定位，Cesium 有viewer.flyTo和camera.flyTo两个定位函数，但是前者只能定位到几何体，后者是相机定位，
 * 和场景位置差异较大，和我们的预期差异较大，该方法是通过Cartesian3定位到场景位置。
 * @exports flyTo
 * @param  {Object} [options={}] 具有以下参数
 * @param {Cesium.Cartesian3} options.destination 飞行位置
 * @param {Number} [options.duration=3.0] 飞行持续时间
 * @param {Number} [options.maximumHeight] 飞行最大高度
 * @param {Cesium.HeadingPitchRange} [options.offset] 偏移
 * @example
 * CesiumPro.flyTo(viewer,{
 *    destination:Cesium.Cartesian3.fromDegrees(110,40),
 *    offset:new Cesium.HeadingPitchRange(heading, pitch, range)
 * })
 */
function flyTo(viewer, options = {}) {
  if (!defined(options.destination)) {
    throw new CesiumProError('parameter destination is required.');
  }
  const boundingSphere = new Cesium.BoundingSphere(options.destination, 1000);
  delete options.destination
  viewer.camera.flyToBoundingSphere(boundingSphere, options);
}
export default flyTo;

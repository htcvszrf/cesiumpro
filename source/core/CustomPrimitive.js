import abstract from './abstract';
import destroyObject from './destroyObject'
class CustomPrimitive {
  /**
   * 自定义图元基类
   */
  constructor(options) {
    options = defaultValue(options, {})
  }
  /**
   * @abstract
   * 每一帧在渲染时Cesium会自动调用该方法。派生类必须实现该方法
   * @param  {Cesium.FrameState} frameState
   */
  update(frameState) {
    abstract();
  }
  /**
   * 对象是否被销毁
   * @return {Boolean} true表示对象已经被销毁，此时使用该对象所有方法和属性都会抛出异常{@link CesiumProError}
   */
  isDestroyed() {
    return false;
  }
  /**
   * 销毁图元，释放所占用的webgl资源，派生类必须实现它。对象销毁后调用它的所有方法和属性都会抛出异常{@link CesiumProError}
   * @abstract
   */
  destroy() {
    abstract();
  }
}
export default CustomPrimitive;

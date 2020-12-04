import defined from './defined';
import defaultValue from './defaultValue';
import guid from './guid';
const defaultShader = `
void main(){
  czm_cesiumpro_main();
}`
class CustomShader {
  /**
   * 3d tileset自定义着色器的管理类，它包含一个顶点着色器和一个片元着色器
   * @param {Object} options 具有以下属性
   * @param {String} [options.key] 着色器的key值，着色器只会作用于与其key值相同的模型
   * @param {String} [options.fragmentShader=''] 片元着色器
   * @param {String} [options.vertexShader=''] 顶点着色器
   */
  constructor(options) {
    options = defaultValue(options, {});
    this._key = defaultValue(options.key, guid());
    this._vertexShader = defaultValue(options.vertexShader, defaultShader);
    this._fragmentShader = defaultValue(options.fragmentShader, defaultShader);
    this._changed = true;
    this._enabled = true;
  }
  /**
   * 表示着色器是否发生了变化，如果为true则在下一帧渲染时重新生成着色器程序
   * @return {Bool} 着色器是否发生了变化
   */
  get changed() {
    return this._changed;
  }
  set changed(val) {
    this._changed = val;
  }
  /**
   * 顶点着色器
   */
  get vertexShader() {
    if (this.enabled) {
      return this._vertexShader;
    }
    return defaultShader
  }
  set vertexShader(val) {
    this._vertexShader = val;
    this._changed = true;
  }
  /**
   * 片元着色器
   */
  get fragmentShader() {
    if (this.enabled) {
      return this._fragmentShader;
    }
    return defaultShader
  }
  set fragmentShader(val) {
    this._fragmentShader = val;
    this._changed = false;
  }
  /**
   * 着色器id,它只会对key值相同的模型生效
   */
  get key() {
    return this._key;
  }
  /**
   * 清除着色器程序
   * @return
   */
  clear() {
    this._vertexShader = defaultShader;
    this._fragmentShader = defaultShader;
    this._changed = true;
  }
  /**
   * 着色器是否生效
   */
  get enabled() {
    return this._enabled;
  }

  set enabled(val) {
    this._enabled = val;
    this._changed = true;
  }
}
export default CustomShader;

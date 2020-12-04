const cachedShader = new Map();

import defaultValue from './defaultValue';
import CesiumProError from './CesiumProError';
import CustomShader from './CustomShader';

/**
 *
 * <p>为3D tileset自定义着色器，着色器应该遵循以下规范:</p>
 * <p>1.着色器必须有一个main函数</p>
 * <p>2.着色器的main函数中必须调用czm_cesiumpro_main函数</p>
 * @param {Cesium.Cesium3DTileset} tileset shader将要作用的tileset
 * @param {Object} options  具有以下属性
 * @param {String} [options.vertexShader] 顶点着色器
 * @param {String} [options.fragmentShader] 片元着色器
 * @return {CustomShader} 自定义shader
 * @exports createTilesetShader
 * @example
 * const tileset=new Cesium.Cesium3DTileset({url:'http://...'});
 * const fragmentShader=`
 * czm_cesiumpro_main();
 * gl_FragColor*=vec4(0.2,0.3,0.1,1.0);
 * `
 * const shader=new CesiumPro.CustomShader({fragmentShader})
 * CesiumPro.createTilesetShader(tileset,shader)
 */
function createTilesetShader(tileset, shader) {
  const key = tileset.url;
  if (shader instanceof CustomShader === false) {
    throw new CesiumProError('parameter shader is invalid.')
  }
  cachedShader.set(key, shader);
  return shader;
}
export {
  cachedShader
};
export default createTilesetShader;

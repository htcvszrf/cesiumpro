import fs from '../shader/postProcessStage/specularReflection'
import PostProcessing from './PostProcessing'
import defaultValue from '../core/defaultValue';
import defined from '../core/defined'

class SpecularReflection extends PostProcessing {
  constructor(viewer, options) {
    super(viewer, options);
  }
  createPostStage() {
    const stage =
      new Cesium.PostProcessStage({
        fragmentShader: fs,
        uniforms: {

        }
      })
    stage.selected = [];
    return stage;
  }
}
export default SpecularReflection

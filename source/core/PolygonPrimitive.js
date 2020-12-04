import defaultValue from './defaultValue'
import CustomPrimitive from './CustomPrimitive'
class PolygonPrimitive {
  constructor(options) {
    const vertex = new Float64Array([
      -0.2, 0.2, 0.0,
      0.2, 0.2, 0.0,
      0.2, -0.2, 0.0,
      // -0.2, -0.2, 0.0
    ])
    const index = new Uint16Array([
      1, 3, 2,
      // 1, 4, 3
    ])
    const attributeLocations = {
      position: 0,
      color: 2
      // normal: 1,
      // textureCoordinates: 2,
    };
    const vs = `
    attribute vec3 position;
    void main(){
      gl_Position= czm_modelViewProjection * vec4(position, 1.0);
    }
    `
    const fs = `
    void main(){
      gl_FragColor=vec4(1.0,0.0,0.0,1.0);
    }
    `
    this.vs = vs;
    this.fs = fs;
    this.attributeLocations = attributeLocations;
    this.vertex = vertex;
    this.index = index;
    const scaleMatrix = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(10000000, 1000000, 1000000));
    this.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(options.center);
    this.show = defaultValue(options.show, true)
    Cesium.Matrix4.multiply(this.modelMatrix, scaleMatrix, this.modelMatrix);


  }
  createVertex(context) {
    const {
      vs,
      fs,
      vertex,
      index,
      attributeLocations
    } = this;
    const geometry = new Cesium.Geometry({
      attributes: {
        position: new Cesium.GeometryAttribute({
          // vtxf 使用double类型的position进行计算
          // componentDatatype : Cesium.ComponentDatatype.DOUBLE,
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: vertex
        }),
      },
      indices: this.index,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(vertex)
    })
    const vertexArray = Cesium.VertexArray.fromGeometry({
      context: context,
      geometry: geometry,
      attributeLocations: attributeLocations,
      bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
      // interleave : true
    });
    return vertexArray
  }
  createCommand(context) {
    const {
      vs,
      fs,
      attributeLocations
    } = this;
    const defaultRenderState = Cesium.Appearance.getDefaultRenderState(false, false, undefined);
    const renderState = Cesium.RenderState.fromCache(defaultRenderState);
    const vertexShaderSource = new Cesium.ShaderSource({
      sources: [vs]
    });
    const fragmentShaderSource = new Cesium.ShaderSource({
      sources: [fs]
    });
    const uniformMap = {
      color: function() {
        return Cesium.Color.RED
      }
    }
    const shaderProgram = Cesium.ShaderProgram.fromCache({
      context: context,
      vertexShaderSource: vertexShaderSource,
      fragmentShaderSource: fragmentShaderSource,
      attributeLocations: attributeLocations
    });
    return new Cesium.DrawCommand({
      vertexArray: this.createVertex(context),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      renderState: renderState,
      shaderProgram: shaderProgram,
      uniformMap: uniformMap,
      owner: this,
      // framebuffer : framebuffer,
      pass: Cesium.Pass.OPAQUE,
      modelMatrix: this.modelMatrix,
    });
    this.show = true;
    this._command = undefined;
    this._createCommand = createCommand;
  }
  update(frameState) {
    if (!this.show) {
      return;
    }

    if (!Cesium.defined(this._command)) {
      this._command = this.createCommand(frameState.context);
    }

    if (Cesium.defined(this._command)) {
      frameState.commandList.push(this._command);
    }
  }
}
export default PolygonPrimitive;

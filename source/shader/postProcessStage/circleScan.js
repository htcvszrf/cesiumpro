const shader = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
varying vec2 v_textureCoordinates;
uniform vec3 center;
uniform float radius;
uniform vec4 color;
uniform vec3 normal;
vec4 toEye(in vec2 uv,in float depth){
  vec2 xy=vec2(uv.x*2.0-1.0,uv.y*2.0-1.0);
  vec4 positionInCamera=czm_inverseProjection*vec4(xy,depth,1.0);
  positionInCamera=positionInCamera/positionInCamera.w;
  return positionInCamera;
}
vec3 pointProjectOnPlane(in vec3 normal,in vec3 origin,in vec3 point){
  vec3 offset=point-origin;
  float d=dot(offset,normal);
  // float cosA=d/(length(normal)+length(point));
  // float sinA=pow((1.0-cosA*cosA),0.5);
  // return point*sinA;
  return point-d*normal;
}
float getDepth(in vec4 depth){
  float z_window=czm_unpackDepth(depth);
  z_window=czm_reverseLogDepth(z_window);
  float n_range=czm_depthRange.near;
  float f_range=czm_depthRange.far;
  return (2.0*z_window-n_range-f_range)/(f_range-n_range);
}
void main(){
  gl_FragColor=texture2D(colorTexture,v_textureCoordinates);
  float depth=getDepth(texture2D(depthTexture,v_textureCoordinates));
  vec4 viewPos=toEye(v_textureCoordinates,depth);
  vec3 planePosition=pointProjectOnPlane(normal.xyz,center.xyz,viewPos.xyz);
  float dis=distance(planePosition.xyz,center.xyz);
  if(dis<radius){
    float f=1.0-abs(radius-dis)/radius;
    f=pow(f,4.0);
    gl_FragColor=mix(gl_FragColor,color,f);
  }
}
`

export default shader;

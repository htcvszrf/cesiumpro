const shader = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
varying vec2 v_textureCoordinates;
uniform vec3 u_center;
uniform vec3 u_lineNormal;
uniform vec3 u_planeNormal;
uniform float radius;
uniform vec4 color;
vec4 toEye(in vec2 uv,in float depth){
  vec2 xy=vec2(uv.x*2.0-1.0,uv.y*2.0-1.0);
  vec4 posInCamera=czm_inverseProjection*vec4(xy,depth,1.0);
  return posInCamera/posInCamera.w;
}
bool isPointOnLineRight(in vec3 ptOnLine,in vec3 normal,in vec3 testPt,in vec3 planeNormal){
  vec3 v01=testPt-ptOnLine;
  v01=normalize(v01);
  vec3 temp=cross(v01,normal);
  float d=dot(temp,planeNormal);
  return d>0.0;
}
vec3 pointProjectOnPlane(in vec3 normal,in vec3 origin,in vec3 point){
  vec3 offset=point-origin;
  float d=dot(normal,offset);
  return (point - d * normal);
}
float distancePointToLine(in vec3 ptOnLine,in vec3 normal,in vec3 testPt){
  vec3 tmp=pointProjectOnPlane(normal,ptOnLine,testPt);
  return distance(tmp,ptOnLine);
}
float getDepth(in vec4 depth){
  float z_window=czm_unpackDepth(depth);
  z_window=czm_reverseLogDepth(z_window);
  float n_range=czm_depthRange.near;
  float f_range=czm_depthRange.far;
  return (2.0*z_window-n_range-f_range)/(f_range-n_range);
}
void main(){
  vec4 center=czm_view * vec4(u_center,1.0);
  vec3 planeNormal=(czm_view*vec4(u_planeNormal,1.0)).xyz;
  planeNormal=normalize(planeNormal);
  vec3 lineNormal=u_lineNormal;
  gl_FragColor = texture2D(colorTexture, v_textureCoordinates);
  float depth=getDepth(texture2D(depthTexture,v_textureCoordinates));
  vec4 viewPos=toEye(v_textureCoordinates,depth);
  vec3 projOnPlane=pointProjectOnPlane(planeNormal.xyz,center.xyz,viewPos.xyz);
  float dis=length(projOnPlane.xyz-center.xyz);
  float radius2=radius*2.0;
  if(dis<radius){
    float f=1.0-abs(radius-dis)/radius;
    f=pow(f,64.0);
    vec3 lineEndPt=vec3(center.xyz)+lineNormal*radius;
    float f0=0.0;
    if(isPointOnLineRight(center.xyz,lineNormal.xyz,projOnPlane.xyz,planeNormal)){
      float dis1=distance(projOnPlane.xyz,lineEndPt);
      f0 = abs(radius2 -dis1) / radius2;
      f0=pow(f0,3.0);
    }
    gl_FragColor=mix(gl_FragColor,color,f+f0);
  }
}
`
export default shader;

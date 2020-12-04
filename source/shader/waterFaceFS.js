const shader = `
uniform sampler2D u_normalMap;
uniform sampler2D u_refractMap;
//uniform samplerCube u_cubeMap;
uniform sampler2D u_reflectMap;
//uniform sampler2D u_flowMap;
uniform vec4 u_waterColor;
uniform vec4 u_refractColor;
uniform int u_useRefractTex;
uniform vec4 u_reflectColor;
uniform int u_reflection;
uniform vec2 u_flowDirection;

varying vec3 eyeDir;
varying vec2 texCoord;
varying float myTime;
varying vec4 projectionCoord;

void main (void)
{
    // texScale determines the amount of tiles generated.
    float texScale = 35.0;
    // texScale2 determines the repeat of the water texture (the normalmap) itself
    float texScale2 = 10.0;
    float myangle;
    float transp;
    vec3 myNormal;

    vec2 mytexFlowCoord = texCoord * texScale;
    //ff是混合因子
    vec2 ff = abs(2.0*(fract(mytexFlowCoord)) - 1.0) -0.5;
    // 取3次幂，使亮的地方更亮，暗的地方更暗
    ff = 0.5-4.0*ff*ff*ff;
    // ffscale is a scaling factor that compensates for the effect that
    // adding normal vectors together tends to get them closer to the average normal
    // which is a visible effect. For more or less random waves, this factor
    // compensates for it
    vec2 ffscale = sqrt(ff*ff + (1.0-ff)*(1.0-ff));
    vec2 Tcoord = texCoord  * texScale2;

    // 水移动时的偏移量
    vec2 offset = vec2(myTime,0.0);

    // I scale the texFlowCoord and floor the value to create the tiling
    // This could have be replace by an extremely lo-res texture lookup
    // using NEAREST pixel.
    vec3 sample = vec3(u_flowDirection, 1.0);//texture2D( u_flowMap, floor(mytexFlowCoord)/ texScale).rgb;

    // flowdir is supposed to go from -1 to 1 and the line below
    // used to be sample.xy * 2.0 - 1.0, but saves a multiply by
    // moving this factor two to the sample.b
    vec2 flowdir = sample.xy -0.5;

    // sample.b is used for the inverse length of the wave
    // could be premultiplied in sample.xy, but this is easier for editing flowtexture
    flowdir *= sample.b;

    // build the rotation matrix that scales and rotates the complete tile
    mat2 rotmat = mat2(flowdir.x, -flowdir.y, flowdir.y ,flowdir.x);

    // this is the normal for tile A
    vec2 NormalT0 = texture2D(u_normalMap, rotmat * Tcoord - offset).rg;

    // for the next tile (B) I shift by half the tile size in the x-direction
    sample = vec3(u_flowDirection, 1.0);//texture2D( u_flowMap, floor((mytexFlowCoord + vec2(0.5,0)))/ texScale ).rgb;
    flowdir = sample.b * (sample.xy - 0.5);
    rotmat = mat2(flowdir.x, -flowdir.y, flowdir.y ,flowdir.x);
    // and the normal for tile B...
    // multiply the offset by some number close to 1 to give it a different speed
    // The result is that after blending the water starts to animate and look
    // realistic, instead of just sliding in some direction.
    // This is also why I took the third power of ff above, so the area where the
    // water animates is as big as possible
    // adding a small arbitrary constant isn't really needed, but helps to show
    // a bit less tiling in the beginning of the program. After a few seconds, the
    // tiling cannot be seen anymore so this constant could be removed.
    // For the quick demo I leave them in. In a simulation that keeps running for
    // some time, you could just as well remove these small constant offsets
    vec2 NormalT1 = texture2D(u_normalMap, rotmat * Tcoord - offset*1.06+0.62).rg;

    // blend them together using the ff factor
    // use ff.x because this tile is shifted in the x-direction
    vec2 NormalTAB = ff.x * NormalT0 + (1.0-ff.x) * NormalT1;

    // the scaling of NormalTab and NormalTCD is moved to a single scale of
    // NormalT later in the program, which is mathematically identical to
    // NormalTAB = (NormalTAB - 0.5) / ffscale.x + 0.5;

    // tile C is shifted in the y-direction
    sample = vec3(u_flowDirection, 1.0);//texture2D( u_flowMap, floor((mytexFlowCoord + vec2(0.0,0.5)))/ texScale ).rgb;
    flowdir = sample.b * (sample.xy - 0.5);
    rotmat = mat2(flowdir.x, -flowdir.y, flowdir.y ,flowdir.x);
    NormalT0 = texture2D(u_normalMap, rotmat * Tcoord - offset*1.33+0.27).rg;

    // tile D is shifted in both x- and y-direction
    sample = vec3(u_flowDirection, 1.0);//texture2D( u_flowMap, floor((mytexFlowCoord + vec2(0.5,0.5)))/ texScale ).rgb;
    flowdir = sample.b * (sample.xy - 0.5);
    rotmat = mat2(flowdir.x, -flowdir.y, flowdir.y ,flowdir.x);
    NormalT1 = texture2D(u_normalMap, rotmat * Tcoord - offset*1.24).rg ;

    vec2 NormalTCD = ff.x * NormalT0 + (1.0-ff.x) * NormalT1;
    // NormalTCD = (NormalTCD - 0.5) / ffscale.x + 0.5;

    // now blend the two values togetherv
    vec2 NormalT = ff.y * NormalTAB + (1.0-ff.y) * NormalTCD;

    // this line below used to be here for scaling the result
    //NormalT = (NormalT - 0.5) / ffscale.y + 0.5;

    // below the new, direct scaling of NormalT
    NormalT = (NormalT - 0.5) / (ffscale.y * ffscale.x);
    // scaling by 0.3 is arbritrary, and could be done by just
    // changing the values in the normal map
    // without this factor, the waves look very strong
    NormalT *= 0.3;
    // to make the water more transparent
    transp = 1.0;//texture2D( u_flowMap, texFlowCoord ).a;
    // and scale the normals with the transparency
    NormalT *= transp*transp;

    // assume normal of plane is 0,0,1 and produce the normalized sum of adding NormalT to it
    myNormal = vec3(NormalT,sqrt(1.0-NormalT.x*NormalT.x - NormalT.y*NormalT.y));

    // 获取反射颜色。
    vec3 envColor = u_reflectColor.rgb;//vec3(0.5647, 0.6941, 0.8235);
    if (u_reflection == 1)
    {
        //vec3 reflectDir = reflect(eyeDir, myNormal);
        //vec3 envColor = vec3(textureCube(u_cubeMap, -reflectDir));
        // 如果要实现反射真实场景，需要把场景渲染5遍构建一个无底的立方体纹理。
        // 目前使用一张反射纹理近似模拟。
        vec2 final = projectionCoord.xy / projectionCoord.w;
        final = final * 0.5 + 0.5;
        final.y = 1.0 - final.y;
        envColor = texture2D(u_reflectMap, final + myNormal.xy/texScale2*transp).rgb;
    }

    // very ugly version of fresnel effect
    // but it gives a nice transparent water, but not too transparent
    myangle = dot(myNormal,normalize(eyeDir));
    myangle = 0.95-0.6*myangle*myangle;

    // blend in the color of the plane below the water

    // add in a little distortion of the colormap for the effect of a refracted
    // view of the image below the surface.
    // (this isn't really tested, just a last minute addition
    // and perhaps should be coded differently

    // the correct way, would be to use the refract routine, use the alpha channel for depth of
    // the water (and make the water disappear when depth = 0), add some watercolor to the colormap
    // depending on the depth, and use the calculated refractdir and the depth to find the right
    // pixel in the colormap.... who knows, something for the next version
    vec3 base = u_refractColor.rgb;//vec3(0.3, 0.4, 0.5);
    if (u_useRefractTex == 1)
        base = texture2D(u_refractMap,(texCoord + myNormal.xy/texScale2*0.03*transp)*32.0).rgb;
    base = mix(base, u_waterColor.rgb, u_waterColor.a);

    // 光照计算(暂不加入)
    //vec3 lightDir = normalize(vec3(0.0, 0.0, 1.0)); // 光照方向需要从外面传入
    //vec3 reflectVec = reflect(-lightDir, myNormal);
    //float diffuse = max(0.0, dot(myNormal, lightDir));
    //float spec = max(dot(reflectVec, normalize(-eyeDir)), 0.0);
    //spec = pow(spec, 128.0);
    //float lightIntensity = 0.7 * diffuse + 0.3 * spec;

    gl_FragColor = vec4(mix(base, envColor, myangle*transp), 1.0);

    // note that smaller waves appear to move slower than bigger waves
    // one could use the tiles and give each tile a different speed if that
    // is what you want
}`
export default shader

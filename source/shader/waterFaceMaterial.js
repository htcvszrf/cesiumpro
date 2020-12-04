const shader = `
uniform sampler2D specularMap;
uniform sampler2D normalMap;
uniform vec4 baseWaterColor;
uniform vec4 blendColor;
uniform float frequency;
uniform float animationSpeed;
uniform float amplitude;
uniform float specularIntensity;
uniform float fadeFactor;
uniform vec4 sizeAndVelocity;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    float width = sizeAndVelocity.x;
    float height = sizeAndVelocity.y;
    float vx = sizeAndVelocity.z;
    float vy = sizeAndVelocity.w;
    czm_material material = czm_getDefaultMaterial(materialInput);

    float time = czm_frameNumber * animationSpeed;

    // fade is a function of the distance from the fragment and the frequency of the waves
    float fade = max(1.0, (length(materialInput.positionToEyeEC) / 10000000000.0) * frequency * fadeFactor);

    // note: not using directional motion at this time, just set the angle to 0.0;
    vec2 st = materialInput.st * vec2(width, height) / 100.0 * frequency;
    st -= vec2(vx*time, vy*time);
    vec4 noise = czm_getWaterNoise(normalMap, st, time, 0.0);
    vec3 normalTangentSpace = noise.xyz * vec3(1.0, 1.0, (1.0 / amplitude));

    // fade out the normal perturbation as we move further from the water surface
    normalTangentSpace.xy /= fade;
    normalTangentSpace = normalize(normalTangentSpace);

    // get ratios for alignment of the new normal vector with a vector perpendicular to the tangent plane
    float tsPerturbationRatio = clamp(dot(normalTangentSpace, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);

    // base color is a blend of the water and non-water color based on the value from the specular map
    // may need a uniform blend factor to better control this
    vec2 v = gl_FragCoord.xy / czm_viewport.zw;
    v.y = 1.0 - v.y;
    material.diffuse = texture2D(specularMap, v + noise.xy*0.03).rgb;

    // diffuse highlights are based on how perturbed the normal is
    material.diffuse += (0.1 * tsPerturbationRatio);

    material.diffuse = mix(baseWaterColor.rgb, material.diffuse, blendColor.rgb);
    material.normal = normalize(materialInput.tangentToEyeMatrix * normalTangentSpace);

    material.specular = specularIntensity;
    material.shininess = 10.0;
    material.alpha = baseWaterColor.a * blendColor.a;

    return material;
}
`
export default shader

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ASCENSION_DURATION, ASCENSION_START, GUIDE_DIALOGUE,
  cloudRealmShader, createCosmicGuide,
  type GuideChoice, type GuideStage,
} from './cosmic-guide';

const COSMIC_ENTRY_RADIUS = 3.35 * 1.3 * 1.15;
// Seven finite octahedral generations, each separated by phi^4 in scale.
const MATRIX_SCALE = ((1 + Math.sqrt(5)) / 2) ** 4;
const MATRIX_ZOOM_END = 7.25;
const COSMIC_DETAIL_RADIUS = 38;
const TIDAL_ZOOM_END = 7.4;
const ORIGINAL_QUA_SITE_URL = 'https://qua.earth/original/index.html';
const MOUSE_DRAG_SENSITIVITY = 0.0042;
const POINTER_LOCK_MOUSE_SENSITIVITY = 0.002205;
const BOX_REALM_ENTRY = {
  distance: 180,
  azimuth: 0.643,
  elevation: 0.164,
  boxYaw: 2.212,
  boxPitch: 1.738,
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform float uCosmicBeat;
  uniform float uMusicBeat;
  uniform float uCometSeed;
  uniform float uAltBeat;
  uniform float uRealityMix;
  uniform float uAltDistance;
  uniform vec2 uBoxTurn;
  uniform vec3 uCameraPosition;
  uniform vec3 uCameraForward;
  uniform vec3 uCameraRight;
  uniform vec3 uCameraUp;
  uniform float uMotion;
  uniform float uMacroZoom;
  uniform float uAscension;
  uniform float uCloudRealm;

  #define STEPS 58
  const float WATER_Y = -80.0;
  const vec3 ALT_SUN_DIRECTION = vec3(-0.3107, 0.2406, -0.9195);

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
      f.y
    );
  }

  float flow2(vec2 p) {
    return noise2(p) * 0.68 + noise2(p * 2.07 + vec2(11.7, 4.3)) * 0.32;
  }

  float triNoise(vec3 p, vec3 direction) {
    vec3 weights = pow(abs(direction), vec3(4.0));
    weights /= max(dot(weights, vec3(1.0)), 0.0001);
    vec3 samples = vec3(
      noise2(p.yz + vec2(13.1, 7.7)),
      noise2(p.zx + vec2(31.6, 2.4)),
      noise2(p.xy + vec2(5.9, 23.2))
    );
    return dot(samples, weights);
  }

  vec3 outerMicroStarfield(vec3 direction) {
    vec3 skyDirection = normalize(direction);
    vec2 skyUv = vec2(
      atan(skyDirection.z, skyDirection.x) * 0.159154943 + 0.5,
      skyDirection.y * 0.5 + 0.5
    );
    vec2 grid = skyUv * vec2(1280.0, 560.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float seed = hash21(cell + 217.3);
    vec2 offset = vec2(
      hash21(cell + 11.7),
      hash21(cell + 73.1)
    ) - 0.5;
    float radius = length(local - offset * 0.7);
    float presence = step(0.9905, seed);
    float pin = (1.0 - smoothstep(0.018, 0.095, radius)) * presence;
    vec3 tint = mix(
      vec3(0.58, 0.72, 1.0),
      vec3(1.0, 0.8, 0.62),
      seed
    );
    return mix(tint, vec3(1.0), 0.28) * pin * 1.28;
  }

  vec3 starfield(vec3 rd) {
    vec3 direction = normalize(rd);
    float coarse = triNoise(direction * 2.15, direction);
    vec2 cloudUv = vec2(
      dot(direction, vec3(0.811, 0.324, -0.486)),
      dot(direction, vec3(-0.287, 0.923, 0.254))
    );
    float detail = noise2(cloudUv * 6.3 + vec2(9.2, 17.4));
    float cloudField = coarse * 0.78 + detail * 0.22;
    float cloud = smoothstep(0.48, 0.75, cloudField);
    float wisps = smoothstep(0.56, 0.82, coarse * 0.55 + detail * 0.45);

    vec3 purple = vec3(0.15, 0.025, 0.29);
    vec3 pink = vec3(0.31, 0.035, 0.15);
    vec3 blue = vec3(0.018, 0.105, 0.31);
    vec3 green = vec3(0.018, 0.15, 0.07);
    vec3 coolMist = mix(purple, blue, smoothstep(-0.58, 0.68, direction.y));
    vec3 livingMist = mix(pink, green, smoothstep(-0.54, 0.58, direction.x));
    vec3 nebula = mix(coolMist, livingMist, 0.4 * smoothstep(0.4, 0.76, detail));
    nebula *= cloud * (0.035 + 0.07 * wisps);

    vec2 skyUv = vec2(
      atan(direction.z, direction.x) * 0.159154943 + 0.5,
      direction.y * 0.5 + 0.5
    );
    vec2 grid = skyUv * vec2(720.0, 320.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float seed = hash21(cell);
    vec2 offset = vec2(hash21(cell + 4.21), hash21(cell + 19.7)) - 0.5;
    vec2 starDelta = local - offset * 0.72;
    float radius = length(starDelta);
    float normalSeed = step(0.9872, seed);
    float brightSeed = step(0.9959, seed);
    float body = (1.0 - smoothstep(0.035, 0.17, radius)) * normalSeed;
    float halo = (1.0 - smoothstep(0.08, 0.34, radius)) * brightSeed;
    float spikeX = (1.0 - smoothstep(0.012, 0.045, abs(starDelta.y)))
      * (1.0 - smoothstep(0.05, 0.38, abs(starDelta.x)));
    float spikeY = (1.0 - smoothstep(0.012, 0.045, abs(starDelta.x)))
      * (1.0 - smoothstep(0.05, 0.38, abs(starDelta.y)));
    float sparkle = (spikeX + spikeY) * brightSeed;
    vec3 temperature = mix(vec3(0.52, 0.68, 1.0), vec3(1.0, 0.72, 0.43), hash21(cell + 9.0));

    vec3 lighterTemperature = mix(temperature, vec3(1.0), 0.38);
    vec3 stars = lighterTemperature * (body * 3.0 + halo * 1.35 + sparkle * 0.8) * 2.128;
    return vec3(0.00072, 0.00058, 0.00105)
      + nebula
      + stars;
  }

  vec3 crystallineCometTrail(
    vec2 lensedSkyPosition,
    float eventCycle,
    float eventPhase,
    float cometIndex,
    float baseAngle
  ) {
    float launchVisibility = smoothstep(0.0, 0.028, eventPhase)
      * (1.0 - smoothstep(0.84, 0.9, eventPhase));
    if (launchVisibility <= 0.001) return vec3(0.0);

    float angleSeed = hash21(vec2(
        eventCycle * 1.91 + cometIndex * 31.73 + 7.4,
        13.1 + cometIndex * 17.37
      ));
    float travelAngle = angleSeed * 6.28318530718;
    vec2 travelDirection = vec2(cos(travelAngle), sin(travelAngle));
    vec2 sideDirection = vec2(-travelDirection.y, travelDirection.x);

    float laneSeed = hash21(vec2(
      eventCycle + cometIndex * 19.73 + 53.0,
      29.1 + cometIndex * 11.7
    ));
    float laneBits = floor(laneSeed * 65535.0);
    float lanePositionSeed = floor(laneBits / 256.0) / 255.0;
    float sizeSeed = mod(laneBits, 256.0) / 255.0;
    float laneOffset = mix(-0.95, 0.95, lanePositionSeed);
    float speedSeed = hash21(vec2(
      eventCycle * 0.83 + cometIndex * 43.17 + 101.0,
      61.0 + cometIndex * 7.9
    ));
    float lookBits = floor(speedSeed * 65535.0);
    float paletteIndex = floor(mod(lookBits, 256.0) * (5.0 / 256.0));
    float speedRandom = floor(lookBits / 256.0) / 255.0;
    float speedScale = mix(0.9, 1.1, speedRandom) * 0.92;
    float sizeScale = mix(0.45, 1.3, sizeSeed);
    // Shuffle one needle, one crystal shard, and one fork-tailed comet per round.
    float styleRandom = baseAngle * 0.15915494309;
    float styleOrder = mix(cometIndex, 2.0 - cometIndex, step(0.5, fract(styleRandom * 3.0)));
    float style = mod(floor(styleRandom * 3.0) + styleOrder, 3.0);
    float needle = 1.0 - step(0.5, style);
    float diamond = step(0.5, style) * (1.0 - step(1.5, style));
    float twinTail = step(1.5, style);
    float lengthScale = needle * 1.45 + diamond * 0.9 + twinTail * 1.12;
    float widthScale = needle * 0.46 + diamond * 1.1 + twinTail * 1.18;
    float progress = smoothstep(
      0.025,
      0.8,
      eventPhase * speedScale
    );

    vec2 headPosition = travelDirection * mix(-1.72, 1.72, progress)
      + sideDirection * laneOffset;
    vec2 relativePosition = lensedSkyPosition - headPosition;
    float along = dot(relativePosition, travelDirection) / (sizeScale * lengthScale);
    float across = dot(relativePosition, sideDirection) / (sizeScale * widthScale);
    if (along < -1.18 || along > 0.22 || abs(across) > 0.24) {
      return vec3(0.0);
    }

    float behind = clamp(-along / 0.94, 0.0, 1.0);
    float tailGate = smoothstep(-1.08, -0.84, along)
      * (1.0 - smoothstep(-0.018, 0.055, along));
    float tailDecay = exp(-behind * 1.85);
    float tailWidth = mix(0.009, 0.03, behind);
    float prismSeparation = tailWidth * 0.6 + twinTail * behind * 0.075;
    float facets = 0.52 + 0.48 * pow(
      0.5 + 0.5 * cos(
        (-along) * mix(86.0, 108.0, sizeSeed)
        + eventCycle * 2.41
        + cometIndex * 1.73
      ),
      10.0
    );

    float whiteCore = exp(-pow(
      across / max(tailWidth * 0.42, 0.002),
      2.0
    )) * tailGate * tailDecay * facets;
    float bluePrism = exp(-pow(
      (across - prismSeparation)
        / max(tailWidth * 0.33, 0.002),
      2.0
    )) * tailGate * tailDecay;
    float pinkPrism = exp(-pow(
      (across + prismSeparation)
        / max(tailWidth * 0.36, 0.002),
      2.0
    )) * tailGate * tailDecay;

    float shardDistance = abs(
      abs(across) - clamp(-along, 0.0, 0.3) * mix(0.13, 0.21, sizeSeed)
    );
    float sideShards = exp(-pow(shardDistance / 0.008, 2.0))
      * smoothstep(-0.31, -0.1, along)
      * (1.0 - smoothstep(-0.1, -0.025, along));
    float diamondMetric = abs(along) * 0.82
      + abs(across) * 1.24;
    float headMetricSquared = needle * (along * along * 0.2 + across * across * 3.8)
      + diamond * diamondMetric * diamondMetric
      + twinTail * (along * along * 0.95 + across * across * 1.15);
    float crystalHead = exp(-headMetricSquared / 0.002116);
    float headHalo = exp(
      -(along * along + across * across) / 0.012
    );

    vec3 primaryTint = vec3(0.08, 0.8, 1.55);
    if (paletteIndex > 0.5) primaryTint = vec3(0.65, 0.12, 1.6);
    if (paletteIndex > 1.5) primaryTint = vec3(1.5, 0.08, 0.65);
    if (paletteIndex > 2.5) primaryTint = vec3(0.16, 1.25, 0.75);
    if (paletteIndex > 3.5) primaryTint = vec3(1.5, 0.8, 0.22);
    vec3 secondaryTint = mix(primaryTint, primaryTint.zxy, 0.3);
    vec3 coreTint = mix(primaryTint, vec3(1.4), 0.48);
    vec3 headTint = mix(primaryTint, vec3(1.5), 0.35);
    float coreWeight = needle * 1.9 + diamond * 1.25 + twinTail * 0.18;
    float prismWeight = needle * 0.3 + diamond * 0.8 + twinTail * 1.15;
    float shardWeight = needle * 0.08 + diamond * 1.05 + twinTail * 0.28;
    vec3 emission = coreTint * whiteCore * coreWeight;
    emission += primaryTint * bluePrism * prismWeight;
    emission += secondaryTint * pinkPrism * prismWeight;
    emission += secondaryTint * sideShards * shardWeight;
    emission += headTint * crystalHead * 2.6;
    emission += primaryTint * headHalo * 0.42;
    return emission * launchVisibility;
  }

  vec3 crystallineComet(vec3 lensedDirection, float beat) {
    // Eighteen beats = eight seconds at 135 BPM; randomized sixteenth-note launches.
    float eventCycle = floor(beat / 18.0) + uCometSeed;
    float beatInRound = mod(beat, 18.0);
    float phasePerBeat = 0.11111111111;
    if (uMotion <= 0.001) return vec3(0.0);

    float forwardProjection = dot(lensedDirection, uCameraForward);
    float frontVisibility = smoothstep(0.03, 0.16, forwardProjection);
    if (frontVisibility <= 0.001) return vec3(0.0);

    float safeForward = max(forwardProjection, 0.035);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 lensedSkyPosition = vec2(
      1.62 * dot(lensedDirection, uCameraRight)
        / (safeForward * max(aspect, 0.1)),
      1.62 * dot(lensedDirection, uCameraUp)
        / safeForward
    );
    float roundSeed = hash21(vec2(
      eventCycle + 17.0,
      eventCycle * 0.731 + 3.7
    ));
    float baseAngle = roundSeed * 6.28318530718;
    float rhythmBits = floor(roundSeed * 65535.0);
    float firstLaunchBeat = 0.25 * mod(rhythmBits, 5.0);
    float secondLaunchBeat = firstLaunchBeat + 0.5
      + 0.25 * mod(floor(rhythmBits / 8.0), 13.0);
    float thirdLaunchBeat = secondLaunchBeat + 0.75
      + 0.25 * mod(floor(rhythmBits / 128.0), 14.0);

    vec3 emission = crystallineCometTrail(
      lensedSkyPosition,
      eventCycle,
      (beatInRound - firstLaunchBeat) * phasePerBeat,
      0.0,
      baseAngle
    );
    emission += crystallineCometTrail(
      lensedSkyPosition,
      eventCycle,
      (beatInRound - secondLaunchBeat) * phasePerBeat,
      1.0,
      baseAngle
    );
    emission += crystallineCometTrail(
      lensedSkyPosition,
      eventCycle,
      (beatInRound - thirdLaunchBeat) * phasePerBeat,
      2.0,
      baseAngle
    );
    return emission * uMotion * frontVisibility;
  }

  float pointRayDistanceSquared(vec3 ro, vec3 rayDirection, vec3 point) {
    float rayT = max(dot(point - ro, rayDirection), 0.0);
    vec3 offset = ro + rayDirection * rayT - point;
    return dot(offset, offset);
  }

  vec3 energyNodes(vec3 ro, vec3 rayDirection, float beat) {
    float phase = beat * 6.28318530718;
    vec3 whiteA = vec3(-0.255,  0.255, 0.0);
    vec3 whiteB = vec3( 0.255,  0.255, 0.0);
    vec3 whiteC = vec3(-0.255, -0.255, 0.0);
    vec3 whiteD = vec3( 0.255, -0.255, 0.0);
    vec3 pinkA = vec3( 0.43,  0.0, 0.025);
    vec3 pinkB = vec3( 0.0,  0.43, 0.025);
    vec3 pinkC = vec3(-0.43,  0.0, 0.025);
    vec3 pinkD = vec3( 0.0, -0.43, 0.025);

    vec4 whiteDistances = vec4(
      pointRayDistanceSquared(ro, rayDirection, whiteA),
      pointRayDistanceSquared(ro, rayDirection, whiteB),
      pointRayDistanceSquared(ro, rayDirection, whiteC),
      pointRayDistanceSquared(ro, rayDirection, whiteD)
    );
    vec4 pinkDistances = vec4(
      pointRayDistanceSquared(ro, rayDirection, pinkA),
      pointRayDistanceSquared(ro, rayDirection, pinkB),
      pointRayDistanceSquared(ro, rayDirection, pinkC),
      pointRayDistanceSquared(ro, rayDirection, pinkD)
    );

    float pulseA = 0.7 + 0.3 * pow(0.5 + 0.5 * sin(phase), 10.0);
    float pulseB = 0.7 + 0.3 * pow(0.5 + 0.5 * sin(phase + 1.5707963), 10.0);
    float pulseC = 0.7 + 0.3 * pow(0.5 + 0.5 * sin(phase + 3.1415926), 10.0);
    float pulseD = 0.7 + 0.3 * pow(0.5 + 0.5 * sin(phase + 4.7123890), 10.0);
    vec4 whitePulses = vec4(pulseA, pulseB, pulseC, pulseD);
    vec4 pinkPulses = vec4(pulseB, pulseC, pulseD, pulseA);
    float whiteGlisten = dot(
      exp(-whiteDistances / (0.045 * 0.045)),
      whitePulses
    ) * 0.62;
    float whiteAura = dot(
      exp(-whiteDistances / (0.115 * 0.115)),
      whitePulses
    ) * 0.065;
    float pinkGlow = dot(
      exp(-pinkDistances / (0.047 * 0.047)),
      pinkPulses
    ) * 0.72;
    float pinkAura = dot(
      exp(-pinkDistances / (0.135 * 0.135)),
      pinkPulses
    ) * 0.105;

    vec3 whiteLight = vec3(0.9, 0.98, 1.35) * whiteGlisten
      + vec3(0.18, 0.48, 1.1) * whiteAura;
    vec3 pinkLight = vec3(1.72, 0.018, 0.58) * pinkGlow
      + vec3(1.05, 0.025, 0.43) * pinkAura;
    return whiteLight + pinkLight;
  }

  vec3 quasarJets(vec3 ro, vec3 rayDirection, float time) {
    vec3 axis = vec3(0.0, 1.0, 0.0);
    float axisDot = dot(rayDirection, axis);
    float rayProjection = dot(rayDirection, ro);
    float axisProjection = dot(axis, ro);
    float denominator = max(1.0 - axisDot * axisDot, 0.0025);
    float rayT = (axisDot * axisProjection - rayProjection) / denominator;
    float axisY = (axisProjection - axisDot * rayProjection) / denominator;

    if (rayT <= 0.0) return vec3(0.0);

    vec3 closestPoint = ro + rayDirection * rayT;
    vec3 radialVector = closestPoint - axis * axisY;
    float radial = length(radialVector);
    float height = abs(axisY);
    float direction = axisY < 0.0 ? -1.0 : 1.0;
    float extent = smoothstep(0.68, 1.05, height)
      * (1.0 - smoothstep(28.0, 40.0, height));
    float width = mix(0.1, 0.54, smoothstep(0.75, 12.0, height));
    float angle = atan(radialVector.z, radialVector.x);

    float primaryFlowPhase = direction * height * 4.2 - time * 1.85;
    float primaryHelixPhase = angle * 3.0 + primaryFlowPhase;
    float helix = 0.5 + 0.5 * sin(primaryHelixPhase);
    float counterHelix = 0.5 + 0.5 * sin(angle * -2.0 + direction * height * 3.1 + time * 1.35);
    float chargePulse = 0.76 + 0.24 * sin(height * 5.6 - time * 6.28318530718);
    float laserWidth = 0.022 + height * 0.005;
    float laser = exp(-pow(radial / laserWidth, 2.0));
    float tunnel = exp(-pow((radial - width * 0.72) / (width * 0.24 + 0.012), 2.0));
    float mist = exp(-radial / (width * 1.65 + 0.025));
    float collar = exp(-pow((height - 0.92) / 0.25, 2.0)) * exp(-pow((radial - 0.52) / 0.17, 2.0));
    // A camera-visible double helix derived from the outer jet phase. The
    // projection keeps its over-under roll legible instead of losing a strand
    // whenever it moves into depth behind the white center laser.
    float coreRollAngle = (1.5707963268 - primaryFlowPhase) / 3.0;
    vec2 coreUnit = vec2(cos(coreRollAngle), sin(coreRollAngle));
    float coreHelixRadius = laserWidth * 2.25;
    vec2 coreHelixOffset = coreUnit * coreHelixRadius;
    float cameraPlaneLength = length(rayDirection.xz);
    vec2 viewTowardCamera = cameraPlaneLength > 0.001
      ? -rayDirection.xz / cameraPlaneLength
      : vec2(0.0, 1.0);
    vec2 viewSide = vec2(-viewTowardCamera.y, viewTowardCamera.x);
    float coreScreenPosition = dot(radialVector.xz, viewSide);
    float strandScreenOffset = dot(coreHelixOffset, viewSide);
    float coreStrandWidth = laserWidth * 0.32 + 0.002;
    float coreGlowWidth = laserWidth * 0.72 + 0.004;
    float coreDistanceA = abs(coreScreenPosition - strandScreenOffset);
    float coreDistanceB = abs(coreScreenPosition + strandScreenOffset);
    float coreBarrelA = exp(-pow(coreDistanceA / coreStrandWidth, 2.0));
    float coreBarrelB = exp(-pow(coreDistanceB / coreStrandWidth, 2.0));
    float coreGlowA = exp(-pow(coreDistanceA / coreGlowWidth, 2.0));
    float coreGlowB = exp(-pow(coreDistanceB / coreGlowWidth, 2.0));
    float depthCue = dot(coreUnit, viewTowardCamera);
    float coreFrontA = 0.68 + 0.32 * (0.5 + 0.5 * depthCue);
    float coreFrontB = 0.68 + 0.32 * (0.5 - 0.5 * depthCue);
    float coreCrossing = pow(
      max(1.0 - abs(dot(coreUnit, viewSide)), 0.0),
      10.0
    );

    vec3 cyan = vec3(0.08, 0.52, 1.2);
    vec3 violet = vec3(0.4, 0.018, 1.38);
    vec3 deepAmethyst = vec3(0.28, 0.008, 1.95);
    vec3 electricViolet = vec3(0.64, 0.045, 2.4);
    vec3 hotPink = vec3(1.58, 0.018, 0.52);
    vec3 rose = vec3(1.22, 0.07, 0.29);
    vec3 sheathColor = mix(hotPink, violet, 0.12 + helix * 0.14);
    sheathColor = mix(sheathColor, cyan, counterHelix * 0.08);
    vec3 emission = vec3(1.0, 0.74, 0.95) * laser * 1.8;
    emission += sheathColor * tunnel * (0.5 + helix * 0.9) * chargePulse;
    emission += mix(rose, hotPink, helix) * mist * (0.1 + counterHelix * 0.12);
    emission += hotPink * tunnel * (0.18 + helix * 0.34);
    float purpleRibbon = tunnel * (0.09 + counterHelix * 0.24)
      * (0.72 + chargePulse * 0.28);
    emission += violet * purpleRibbon;
    emission += mix(hotPink, violet, 0.28 + counterHelix * 0.18) * collar * 0.58;
    vec3 crystalPurple = vec3(0.96, 0.035, 2.2);
    vec3 coreColorA = mix(
      deepAmethyst,
      electricViolet,
      0.56 + coreFrontA * 0.2
    );
    vec3 coreColorB = mix(
      electricViolet,
      crystalPurple,
      0.38 + coreFrontB * 0.22
    );
    float coreEnergy = 3.0 + chargePulse * 0.8;
    emission += coreColorA * coreBarrelA * coreEnergy * coreFrontA;
    emission += coreColorB * coreBarrelB * coreEnergy * coreFrontB;
    emission += deepAmethyst
      * (coreGlowA * coreFrontA + coreGlowB * coreFrontB)
      * 0.36;
    emission += electricViolet
      * (coreGlowA + coreGlowB)
      * coreCrossing
      * 0.22;
    return emission * extent;
  }

  vec3 diskPalette(float heat) {
    vec3 deepRed = vec3(0.34, 0.003, 0.0004);
    vec3 ember = vec3(1.0, 0.045, 0.0015);
    vec3 hotOrange = vec3(1.48, 0.28, 0.018);
    vec3 color = mix(deepRed, ember, smoothstep(0.0, 0.62, heat));
    return mix(color, hotOrange, smoothstep(0.64, 1.0, heat));
  }

  vec3 rotateY(vec3 point, float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return vec3(
      cosine * point.x - sine * point.z,
      point.y,
      sine * point.x + cosine * point.z
    );
  }

  vec3 rotateX(vec3 point, float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return vec3(
      point.x,
      cosine * point.y - sine * point.z,
      sine * point.y + cosine * point.z
    );
  }

  bool boxShellHit(
    vec3 ro,
    vec3 rayDirection,
    vec3 halfSize,
    vec2 rotation,
    out float hitDistance,
    out vec3 localPoint,
    out vec3 localNormal,
    out vec2 panelUv,
    out float edgeDistance
  ) {
    vec3 localOrigin = rotateX(rotateY(ro, -rotation.x), -rotation.y);
    vec3 localRay = rotateX(rotateY(rayDirection, -rotation.x), -rotation.y);
    vec3 directionSign = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), localRay));
    vec3 inverseRay = directionSign / max(abs(localRay), vec3(0.00001));
    vec3 firstDistances = (-halfSize - localOrigin) * inverseRay;
    vec3 secondDistances = (halfSize - localOrigin) * inverseRay;
    vec3 nearDistances = min(firstDistances, secondDistances);
    vec3 farDistances = max(firstDistances, secondDistances);
    float nearDistance = max(nearDistances.x, max(nearDistances.y, nearDistances.z));
    float farDistance = min(farDistances.x, min(farDistances.y, farDistances.z));

    hitDistance = 1000000.0;
    localPoint = vec3(0.0);
    localNormal = vec3(0.0, 1.0, 0.0);
    panelUv = vec2(0.0);
    edgeDistance = 0.0;
    if (farDistance <= 0.002 || nearDistance > farDistance) return false;

    hitDistance = nearDistance > 0.002 ? nearDistance : farDistance;
    localPoint = localOrigin + localRay * hitDistance;
    vec3 faceWeight = abs(localPoint) / halfSize;
    if (faceWeight.x >= faceWeight.y && faceWeight.x >= faceWeight.z) {
      float faceSign = localPoint.x < 0.0 ? -1.0 : 1.0;
      localNormal = vec3(faceSign, 0.0, 0.0);
      panelUv = localPoint.yz;
      edgeDistance = min(halfSize.y - abs(localPoint.y), halfSize.z - abs(localPoint.z));
    } else if (faceWeight.y >= faceWeight.z) {
      float faceSign = localPoint.y < 0.0 ? -1.0 : 1.0;
      localNormal = vec3(0.0, faceSign, 0.0);
      panelUv = localPoint.xz;
      edgeDistance = min(halfSize.x - abs(localPoint.x), halfSize.z - abs(localPoint.z));
    } else {
      float faceSign = localPoint.z < 0.0 ? -1.0 : 1.0;
      localNormal = vec3(0.0, 0.0, faceSign);
      panelUv = localPoint.xy;
      edgeDistance = min(halfSize.x - abs(localPoint.x), halfSize.y - abs(localPoint.y));
    }
    return true;
  }

  vec3 boxNormalToWorld(vec3 localNormal, vec2 rotation) {
    return rotateY(rotateX(localNormal, rotation.y), rotation.x);
  }

  float boxPanelLines(vec2 uv, float frequency) {
    vec2 cell = fract(uv * frequency + vec2(0.19, 0.37));
    vec2 edge = min(cell, 1.0 - cell);
    return 1.0 - smoothstep(0.012, 0.052, min(edge.x, edge.y));
  }

  vec3 alternateSky(vec3 direction) {
    vec3 skyDirection = normalize(direction);
    float height = smoothstep(-0.18, 0.72, skyDirection.y);
    float horizon = pow(max(1.0 - abs(skyDirection.y), 0.0), 7.0);
    vec3 sky = mix(vec3(0.018, 0.008, 0.035), vec3(0.46, 0.34, 0.56), height);
    sky += vec3(0.42, 0.075, 0.24) * horizon;

    float sunAlignment = max(dot(skyDirection, ALT_SUN_DIRECTION), 0.0);
    float sunDisk = smoothstep(0.99845, 0.99958, sunAlignment);
    float sunCore = smoothstep(0.99964, 0.99994, sunAlignment);
    float sunCorona = pow(sunAlignment, 34.0);
    float sunBloom = pow(sunAlignment, 7.0);
    sky += vec3(1.28, 0.55, 0.16) * sunDisk * 1.25;
    sky += vec3(1.0, 0.91, 0.72) * sunCore * 1.6;
    sky += vec3(0.92, 0.19, 0.055) * sunCorona * 0.42;
    sky += vec3(0.35, 0.045, 0.12) * sunBloom * 0.12;
    return sky;
  }

  bool waterHit(
    vec3 ro,
    vec3 rayDirection,
    out float hitDistance,
    out vec3 waterColor
  ) {
    hitDistance = 1000000.0;
    waterColor = vec3(0.0);
    if (abs(rayDirection.y) < 0.0004) return false;

    float distance = (WATER_Y - ro.y) / rayDirection.y;
    if (distance <= 0.002) return false;

    hitDistance = distance;
    vec3 waterPoint = ro + rayDirection * distance;
    float phase = uAltBeat * 6.28318530718;
    // Four coherent wind-driven waves, with distant ripples filtered away.
    vec2 kA = vec2(0.045, 0.014);
    vec2 kB = vec2(0.074, 0.035);
    vec2 kC = vec2(0.136, -0.018);
    vec2 kD = vec2(0.247, 0.085);
    float waveA = dot(waterPoint.xz, kA) + phase * 0.10;
    float waveB = dot(waterPoint.xz, kB) + phase * 0.15;
    float waveC = dot(waterPoint.xz, kC) + phase * 0.23;
    float waveD = dot(waterPoint.xz, kD) + phase * 0.34;
    float swellFade = 1.0 - smoothstep(400.0, 1800.0, distance);
    float detailFade = 1.0 - smoothstep(120.0, 550.0, distance);
    vec2 swell = 3.0 * kA * cos(waveA) + 1.45 * kB * cos(waveB);
    vec2 ripples = 0.42 * kC * cos(waveC) + 0.16 * kD * cos(waveD);
    vec2 slope = swell * swellFade + ripples * detailFade;
    vec3 waterNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    if (ro.y < WATER_Y) waterNormal = -waterNormal;

    float facing = max(dot(waterNormal, -rayDirection), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
    vec3 reflectedSky = alternateSky(reflect(rayDirection, waterNormal));
    float reflectedLuma = dot(reflectedSky, vec3(0.2126, 0.7152, 0.0722));
    reflectedSky = mix(vec3(reflectedLuma), reflectedSky, 0.82);
    vec3 deepWater = ro.y < WATER_Y
      ? vec3(0.002, 0.012, 0.018)
      : vec3(0.004, 0.024, 0.031);
    waterColor = mix(deepWater, reflectedSky, fresnel);

    vec3 viewDirection = -rayDirection;
    vec3 reflectedSun = reflect(-ALT_SUN_DIRECTION, waterNormal);
    float sunMirror = max(dot(viewDirection, reflectedSun), 0.0);
    float sunSpark = pow(sunMirror, mix(70.0, 145.0, detailFade)) * 0.45;
    float sunFacing = max(dot(waterNormal, ALT_SUN_DIRECTION), 0.0);
    float aboveWater = step(WATER_Y + 0.001, ro.y);
    waterColor += vec3(1.0, 0.79, 0.57) * sunSpark * sunFacing * aboveWater;
    float fog = (1.0 - exp(-distance * 0.0018)) * 0.22;
    waterColor = mix(waterColor, vec3(0.12, 0.075, 0.13), fog);
    return true;
  }

  vec4 alternateBeam(vec3 ro, vec3 rayDirection, float beat, out float beamDistance) {
    beamDistance = 1000000.0;
    vec3 axis = vec3(0.0, 1.0, 0.0);
    float axisDot = dot(rayDirection, axis);
    float rayProjection = dot(rayDirection, ro);
    float axisProjection = ro.y;
    float denominator = max(1.0 - axisDot * axisDot, 0.0025);
    float rayT = (axisDot * axisProjection - rayProjection) / denominator;
    if (rayT <= 0.0) return vec4(0.0);
    beamDistance = rayT;

    float axisY = (axisProjection - axisDot * rayProjection) / denominator;
    vec3 closestPoint = ro + rayDirection * rayT;
    vec3 radialVector = closestPoint - axis * axisY;
    float radial = length(radialVector);
    float height = abs(axisY);
    float direction = axisY < 0.0 ? -1.0 : 1.0;
    float extent = smoothstep(1.14, 1.48, height) * (1.0 - smoothstep(19.0, 25.0, height));
    float sideVisibility = smoothstep(0.006, 0.045, denominator);
    float width = 0.075 + max(height - 1.14, 0.0) * 0.032;
    float normalizedRadius = radial / max(width, 0.001);
    float radiusSquared = normalizedRadius * normalizedRadius;
    float core = exp2(-6.0 * radiusSquared);
    float sheathOffset = normalizedRadius - 0.72;
    float sheath = exp2(-12.0 * sheathOffset * sheathOffset);
    float mist = exp2(-1.4 * radiusSquared);
    float angle = atan(radialVector.z, radialVector.x);
    float phase = beat * 6.28318530718;
    float helix = 0.5 + 0.5 * sin(angle * 2.0 + direction * height * 3.5 - phase * 0.72);
    float purpleHelix = 0.5 + 0.5 * sin(
      angle * -2.4 + direction * height * 2.8 + phase * 0.54
    );
    float pulse = 0.88 + 0.12 * sin(phase - height * 2.15);
    float opacity = extent * sideVisibility * pulse
      * (core * 0.09 + sheath * (0.22 + helix * 0.18) + mist * 0.055);
    opacity = clamp(opacity, 0.0, 0.52);

    vec3 hotPink = vec3(1.5, 0.015, 0.48);
    vec3 orchid = vec3(0.66, 0.028, 1.16);
    vec3 electricPurple = vec3(0.38, 0.012, 1.42);
    vec3 beamColor = mix(hotPink, orchid, 0.1 + helix * 0.16);
    vec3 emission = beamColor * opacity * 2.0;
    float purpleRibbon = extent * sideVisibility * pulse * sheath
      * (0.09 + purpleHelix * 0.21);
    emission += electricPurple * purpleRibbon;
    emission += vec3(1.0, 0.32, 0.72) * core * extent * sideVisibility * 0.13;
    return vec4(emission, opacity * 0.82);
  }

  // Beyond the familiar chamber: a finite tidal cathedral, assembled from
  // seventeen analytic glass frames rather than additional ray-marched rooms.
  vec3 tidalFrame(
    vec3 origin, vec3 ray, vec3 center, float size, vec2 turn,
    float phase, float limit, bool reflection, float sceneScale
  ) {
    vec3 point, normal;
    vec2 uv;
    float distance, edge;
    vec3 emission = vec3(0.0);
    vec3 traceOrigin = origin - center;
    float traveled = 0.0;
    for (int face = 0; face < 2; face++) {
      bool hit = boxShellHit(traceOrigin, ray, vec3(size), turn,
        distance, point, normal, uv, edge);
      if (!hit) break;
      float totalDistance = traveled + distance;
      vec3 worldPoint = origin + ray * totalDistance;
      // The sea clips submerged frame segments; its mirror uses the same test.
      if (totalDistance < limit && worldPoint.y * sceneScale >= -1.53846) {
        float edgeWidth = max(size * 0.011, totalDistance / max(uResolution.y, 1.0) * 1.5);
        float line = exp2(-2.4 * pow(edge / edgeWidth, 2.0));
        float halo = exp2(-1.2 * edge / max(size * 0.075, edgeWidth));
        vec3 worldNormal = boxNormalToWorld(normal, turn);
        float fresnel = pow(1.0 - abs(dot(ray, worldNormal)), 3.0);
        float carving = boxPanelLines(uv / size, 2.2);
        float resolution = 1.0 - smoothstep(0.1, 0.45, length(fwidth(uv / size)));
        float pulse = 0.9 + 0.1 * sin(uAltBeat * 0.25 + phase);
        vec3 copper = mix(vec3(1.24, 0.13, 0.022), vec3(0.72, 0.018, 0.15),
          0.5 + 0.5 * sin(phase * 0.7));
        vec3 violet = vec3(0.29, 0.12, 0.49);
        emission += (copper * (line * 0.88 + halo * 0.14)
          + violet * fresnel * 0.025
          + copper * carving * resolution * 0.014) * pulse
          * (face == 0 ? 1.0 : 0.48);
      }
      float stepForward = distance + size * 0.0001;
      traceOrigin += ray * stepForward;
      traveled += stepForward;
    }
    return emission * (reflection ? 0.7 : 1.0);
  }

  vec3 tidalArchitecture(vec3 origin, vec3 ray, float journey, float limit, bool reflection) {
    const float PHI = 1.61803398875;
    float gathering = smoothstep(6.4, 7.4, journey);
    float scale = mix(1.0, 0.035, gathering * gathering);
    vec3 emission = vec3(0.0);
    vec2 chamberTurn = uBoxTurn;
    // The original two opposing cubes remain at the center of the journey.
    emission += tidalFrame(origin / scale, ray, vec3(0.0), 1.0,
      -chamberTurn * 1.35, 0.0, limit / scale, reflection, scale);
    emission += tidalFrame(origin / scale, ray, vec3(0.0), 0.53846,
      chamberTurn, 1.0, limit / scale, reflection, scale);
    float gates = smoothstep(0.08, 0.9, journey);
    for (int i = 0; i < 8; i++) {
      float n = float(i);
      float angle = n * 0.7853981634;
      vec3 center = vec3(cos(angle) * 4.8,
        0.35 + 0.55 * sin(angle * 3.0 + uAltBeat * 0.013), sin(angle) * 4.8);
      vec2 turn = vec2(angle + sin(uBoxTurn.x) * 0.12 + uAltBeat * 0.005,
        0.18 * sin(angle + uAltBeat * 0.017));
      emission += tidalFrame(origin / scale, ray, center, 0.62,
        turn, n * 0.8, limit / scale, reflection, scale) * gates;
    }
    // Golden-ratio spans: each new structure surrounds all earlier ones.
    // Alternating turns make a dimensional rose rather than a cube lattice.
    for (int i = 0; i < 7; i++) {
      float n = float(i);
      float size = 1.8 * pow(PHI * PHI, n + 1.0);
      float reveal = smoothstep(n * 0.65 + 0.5, n * 0.65 + 1.35, journey);
      if (reveal < 0.001) continue;
      float sign = mod(n, 2.0) < 0.5 ? 1.0 : -1.0;
      vec2 turn = vec2(n * 0.366 + sign * (sin(uBoxTurn.x) * 0.11 + uAltBeat * 0.004),
        n * 0.284 + sign * (sin(uBoxTurn.y) * 0.09 + uAltBeat * 0.003));
      turn += vec2(gathering * 0.9, gathering * 0.38);
      emission += tidalFrame(origin / scale, ray, vec3(0.0), size,
        turn, n * 1.618 + 3.0, limit / scale, reflection, scale) * reveal;
    }
    return emission;
  }

  vec3 tidalSky(vec3 ray, float journey) {
    float night = smoothstep(1.0, 7.0, journey);
    float horizon = exp(-abs(ray.y) * 18.0);
    vec3 sky = alternateSky(ray) * mix(0.78, 0.09, night);
    sky += mix(vec3(0.085, 0.009, 0.035), vec3(0.025, 0.012, 0.045), night) * horizon;
    sky += outerMicroStarfield(ray) * night * 0.35;
    return sky;
  }

  vec3 tidalJourney(vec3 ray, float journey) {
    const float SEA = -1.53846;
    // Coordinate sizes stay modest even at the outermost architectural span.
    float distance = 3.46153846 * exp(journey);
    vec3 direction = normalize(uCameraPosition);
    vec3 origin = direction * distance;
    float waterDistance = 1000000.0;
    if (abs(ray.y) > 0.0001) {
      float hit = (SEA - origin.y) / ray.y;
      if (hit > 0.0) waterDistance = hit;
    }
    vec3 color = tidalSky(ray, journey);
    if (waterDistance < 999999.0) {
      vec3 point = origin + ray * waterDistance;
      float detail = 1.0 - smoothstep(12.0, 80.0, waterDistance);
      vec2 slope = vec2(sin(point.x * 1.7 + point.z * 0.6 + uAltBeat * 0.22),
        cos(point.z * 1.5 - point.x * 0.5 - uAltBeat * 0.17)) * detail * 0.025;
      vec3 normal = normalize(vec3(slope.x, 1.0, slope.y));
      float fresnel = 0.09 + 0.91 * pow(1.0 - abs(dot(normal, -ray)), 3.0);
      vec3 reflected = reflect(ray, normal);
      color = mix(vec3(0.003, 0.009, 0.019), tidalSky(reflected, journey), fresnel);
      vec3 mirrorOrigin = vec3(origin.x, 2.0 * SEA - origin.y, origin.z);
      vec3 mirrorRay = vec3(ray.x, -ray.y, ray.z);
      vec3 reflection = tidalArchitecture(mirrorOrigin, mirrorRay, journey, 1000000.0, true);
      float shimmer = 0.88 + 0.12 * sin(point.z * 2.3 + point.x * 0.45 + uAltBeat * 0.4) * detail;
      color += reflection * fresnel * shimmer;
      // Soft, scale-aware rings of reflected light trace the cathedral's tides.
      float tideScale = exp(journey * 0.82);
      float radial = length(point.xz) / tideScale;
      float tide = abs(sin(radial * 0.62 - uAltBeat * 0.008));
      float aa = max(fwidth(radial) * 0.62, 0.014);
      float lines = 1.0 - smoothstep(0.0, aa * 2.0, tide);
      color += vec3(0.024, 0.12, 0.15) * lines * exp(-radial * 0.06)
        * smoothstep(0.7, 2.0, journey) * 0.25;
      if (origin.y < SEA) color *= vec3(0.3, 0.56, 0.68);
    }
    color += tidalArchitecture(origin, ray, journey, waterDistance, false);
    float ending = smoothstep(6.75, 7.4, journey);
    float centralAngle = length(cross(normalize(origin), ray));
    color += vec3(0.8, 0.12, 0.045) * exp(-pow(centralAngle / 0.0025, 2.0)) * ending;
    color += vec3(0.17, 0.025, 0.055) * exp(-centralAngle * 110.0) * ending * 0.3;
    return 1.0 - exp(-max(color, vec3(0.0)) * 1.05);
  }

  vec3 alternateReality(vec3 rayDirection) {
    float journey = max(0.0, log(uAltDistance / 180.0));
    vec3 distantRealm = vec3(0.0);
    if (journey > 0.0) {
      distantRealm = tidalJourney(rayDirection, journey);
      if (journey >= 0.8) return distantRealm;
    }
    vec3 altOrigin = normalize(uCameraPosition) * uAltDistance;
    vec2 innerTurn = uBoxTurn;
    vec2 outerTurn = -uBoxTurn * 1.35;

    float waterDistance;
    vec3 waterColor;
    bool hasWater = waterHit(altOrigin, rayDirection, waterDistance, waterColor);
    float opaqueDistance = hasWater ? waterDistance : 1000000.0;
    vec3 roomColor = hasWater ? waterColor : alternateSky(rayDirection);

    float sphereRadius = 1.24;
    float sphereB = dot(altOrigin, rayDirection);
    float sphereC = dot(altOrigin, altOrigin) - sphereRadius * sphereRadius;
    float sphereDiscriminant = sphereB * sphereB - sphereC;
    if (sphereDiscriminant > 0.0) {
      float sphereRoot = sqrt(sphereDiscriminant);
      float nearSphereDistance = -sphereB - sphereRoot;
      float farSphereDistance = -sphereB + sphereRoot;
      float sphereDistance = nearSphereDistance > 0.0 ? nearSphereDistance : farSphereDistance;
      if (sphereDistance > 0.0 && sphereDistance < opaqueDistance) {
        vec3 spherePoint = altOrigin + rayDirection * sphereDistance;
        vec3 sphereNormal = normalize(spherePoint);
        vec3 viewDirection = -rayDirection;
        vec3 lightDirection = normalize(vec3(-0.38, 0.8, 0.46));
        vec3 halfDirection = normalize(lightDirection + viewDirection);
        float diffuse = max(dot(sphereNormal, lightDirection), 0.0);
        float specular = pow(max(dot(sphereNormal, halfDirection), 0.0), 112.0);
        float fresnel = pow(1.0 - max(dot(sphereNormal, viewDirection), 0.0), 4.0);
        float movingGlisten = pow(
          0.5 + 0.5 * sin(
            dot(spherePoint, normalize(vec3(0.72, 0.31, 0.61))) * 24.0
            - uAltBeat * 6.28318530718
          ),
          22.0
        );
        vec3 sphereColor = vec3(0.0007, 0.0008, 0.0011);
        sphereColor += vec3(0.012, 0.014, 0.019) * diffuse;
        sphereColor += vec3(0.52, 0.57, 0.66) * specular * (0.16 + movingGlisten * 0.46);
        sphereColor += vec3(0.09, 0.035, 0.12) * fresnel * 0.16;
        roomColor = clamp(sphereColor, 0.0, 0.28);
        opaqueDistance = sphereDistance;
      }
    }

    float beamDistance;
    vec4 roomBeam = alternateBeam(altOrigin, rayDirection, uAltBeat, beamDistance);
    if (beamDistance < opaqueDistance) {
      roomColor = roomColor * (1.0 - roomBeam.a * 0.8) + roomBeam.rgb;
    }

    vec3 outerPoint;
    vec3 outerNormal;
    vec2 outerUv;
    float outerEdgeDistance;
    float outerDistance;
    bool outerHit = boxShellHit(
      altOrigin,
      rayDirection,
      vec3(52.0),
      outerTurn,
      outerDistance,
      outerPoint,
      outerNormal,
      outerUv,
      outerEdgeDistance
    );

    vec3 innerPoint;
    vec3 innerNormal;
    vec2 innerUv;
    float innerEdgeDistance;
    float innerDistance;
    bool innerHit = boxShellHit(
      altOrigin,
      rayDirection,
      vec3(28.0),
      innerTurn,
      innerDistance,
      innerPoint,
      innerNormal,
      innerUv,
      innerEdgeDistance
    );

    float outerLines = boxPanelLines(outerUv, 0.085);
    float outerEdge = 1.0 - smoothstep(0.1, 2.4, outerEdgeDistance);
    vec3 outerNormalWorld = boxNormalToWorld(outerNormal, outerTurn);
    float outerFresnel = pow(1.0 - abs(dot(rayDirection, outerNormalWorld)), 2.4);
    float outerGlint = pow(max(dot(
      reflect(rayDirection, outerNormalWorld),
      normalize(vec3(-0.45, 0.72, 0.53))
    ), 0.0), 18.0);
    float outerSweep = pow(0.5 + 0.5 * sin(outerUv.x * 0.12 + outerUv.y * 0.045), 10.0);
    vec3 outerChrome = vec3(0.72, 0.025, 0.004) * (0.34 + outerFresnel * 0.8)
      + vec3(1.35, 0.31, 0.018) * (outerGlint + outerSweep * 0.28);
    outerChrome += vec3(1.3, 0.34, 0.035) * (outerLines * 0.16 + outerEdge * 0.28);
    float outerAlpha = clamp(
      0.28 + outerLines * 0.28 + outerEdge * 0.3 + outerFresnel * 0.26,
      0.28,
      0.82
    );
    outerChrome = mix(vec3(0.965, 0.95, 0.965), outerChrome, 0.86);

    vec3 innerNormalWorld = boxNormalToWorld(innerNormal, innerTurn);
    float innerLines = boxPanelLines(innerUv, 0.14);
    float innerEdge = 1.0 - smoothstep(0.08, 1.7, innerEdgeDistance);
    float innerFacing = 1.0 - abs(dot(rayDirection, innerNormalWorld));
    float innerFresnel = innerFacing * innerFacing * innerFacing;
    float innerGlint = pow(max(dot(
      reflect(rayDirection, innerNormalWorld),
      normalize(vec3(0.62, 0.48, -0.62))
    ), 0.0), 22.0);
    float innerSweep = pow(0.5 + 0.5 * sin(innerUv.x * 0.18 - innerUv.y * 0.075), 12.0);
    vec3 innerChrome = vec3(0.48, 0.004, 0.008) * (0.38 + innerFresnel)
      + vec3(1.28, 0.095, 0.025) * (innerGlint + innerSweep * 0.32);
    innerChrome += vec3(1.24, 0.11, 0.025) * (innerLines * 0.19 + innerEdge * 0.32);
    float innerAlpha = clamp(
      0.2 + innerLines * 0.4 + innerEdge * 0.38 + innerFresnel * 0.34,
      0.2,
      0.74
    );
    innerChrome = mix(vec3(0.97, 0.89, 0.9), innerChrome, 0.9);

    bool outerVisible = outerHit && outerDistance < opaqueDistance;
    bool innerVisible = innerHit && innerDistance < opaqueDistance;
    if (outerVisible && innerVisible) {
      if (outerDistance > innerDistance) {
        roomColor = mix(roomColor, outerChrome, outerAlpha);
        roomColor = mix(roomColor, innerChrome, innerAlpha);
      } else {
        roomColor = mix(roomColor, innerChrome, innerAlpha);
        roomColor = mix(roomColor, outerChrome, outerAlpha);
      }
    } else if (outerVisible) {
      roomColor = mix(roomColor, outerChrome, outerAlpha);
    } else if (innerVisible) {
      roomColor = mix(roomColor, innerChrome, innerAlpha);
    }

    if (altOrigin.y < WATER_Y) {
      float waterDepth = WATER_Y - altOrigin.y;
      float underwaterFog = clamp(0.18 + waterDepth * 0.012, 0.18, 0.82);
      float caustic = 0.5 + 0.5 * sin(
        rayDirection.x * 27.0 + rayDirection.z * 19.0 + uAltBeat * 2.4
      );
      roomColor = mix(roomColor, vec3(0.002, 0.027, 0.043), underwaterFog);
      roomColor += vec3(0.012, 0.08, 0.09) * caustic * (1.0 - underwaterFog) * 0.16;
    }

    return mix(clamp(roomColor, 0.0, 1.0), distantRealm, smoothstep(0.0, 0.8, journey));
  }

  // Fixed-work analytic hierarchy. Only the nearest sphere and its visible
  // children are shaded; subpixel descendants dissolve into a starry density.
  vec3 matrixSphereStars(vec2 uv, float seed) {
    vec2 cell = floor(uv * 94.0);
    vec2 local = fract(uv * 94.0) - 0.5;
    float h = hash21(cell + seed * 17.3);
    vec2 offset = vec2(hash21(cell + seed), hash21(cell + 7.1 + seed)) - 0.5;
    float pin = exp(-dot(local - offset * 0.62, local - offset * 0.62) * 180.0);
    float presence = smoothstep(0.91, 0.985, h);
    float detail = 1.0 - smoothstep(0.35, 1.2, length(fwidth(uv * 94.0)));
    return mix(vec3(0.38, 0.65, 1.0), vec3(1.0, 0.68, 0.9), h)
      * (pin * presence * detail * 1.8 + (1.0 - detail) * 0.0015);
  }

  float matrixSphereHit(vec3 origin, vec3 ray, out vec3 center, out float id) {
    float nearest = 1000.0;
    center = vec3(0.0);
    id = 0.0;
    // A finite cuboctahedral lattice: center, six axial, twelve edge spheres.
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          if (abs(x) + abs(y) + abs(z) > 2) continue;
          vec3 cell = vec3(float(x), float(y), float(z));
          float gathering = smoothstep(0.01, 2.6, uAscension);
          float sphereRadius = mix(1.0, 0.018, smoothstep(2.55, 3.85, uAscension));
          vec3 c = cell * 2.65 * (1.0 - gathering);
          vec3 oc = origin - c;
          float b = dot(oc, ray);
          float d = b * b - dot(oc, oc) + sphereRadius * sphereRadius;
          if (d < 0.0) continue;
          float root = sqrt(d);
          float t = -b - root;
          if (t < 0.001) t = -b + root;
          if (t > 0.001 && t < nearest) {
            nearest = t; center = c;
            id = dot(cell, vec3(13.1, 47.3, 83.7));
          }
        }
      }
    }
    return nearest;
  }

  vec3 matrixSurface(vec3 origin, vec3 ray, vec3 center, float nearest, float id, float generation) {
    vec3 n = normalize(origin + ray * nearest - center);
    float facing = abs(dot(n, -ray));
    float rim = pow(1.0 - facing, 2.7);
    vec2 uv = vec2(atan(n.z, n.x) * 0.159154943, n.y * 0.5);
    vec3 pearl = mix(vec3(0.18, 0.4, 0.58), vec3(0.53, 0.18, 0.47),
      0.5 + 0.5 * sin(id * 0.21 + n.y * 2.0 + generation * 0.7));
    float shell = smoothstep(0.035, 0.3, facing);
    vec3 color = vec3(0.002, 0.003, 0.011) + pearl * rim * 0.8;
    color += matrixSphereStars(uv, id + generation * 9.0) * shell;
    color += matrixSphereStars(uv * 1.73 + n.z * 0.08, id + 37.0)
      * shell * 0.72;
    // A miniature cosmic core keeps the black-hole/jet silhouette readable
    // after its original ray-marched image becomes smaller than a pixel.
    vec3 impact = origin + ray * max(dot(center - origin, ray), 0.0) - center;
    vec2 coreUv = vec2(dot(impact, uCameraRight), dot(impact, uCameraUp));
    // The reference's luminous depth: refracted star layers, green/gold
    // nebular haze and fine radial light around each tiny cosmic center.
    float mistField = noise2(coreUv * 2.8 + vec2(id * 0.17, generation))
      * 0.68 + noise2(n.zx * 4.1 + id * 0.13) * 0.32;
    vec3 mistTint = mix(vec3(0.035, 0.28, 0.15), vec3(0.29, 0.13, 0.035),
      smoothstep(0.3, 0.75, mistField));
    color += mistTint * smoothstep(0.32, 0.78, mistField) * shell * 0.24;
    float coreRadius = length(coreUv);
    float coreAngle = atan(coreUv.y, coreUv.x);
    float spokes = pow(0.5 + 0.5 * cos(coreAngle * 37.0 + id), 46.0)
      + pow(0.5 + 0.5 * cos(coreAngle * 23.0 - id), 58.0) * 0.45;
    float starWidth = max(0.008, length(fwidth(coreUv)) * 0.7);
    float centralStar = exp(-pow(coreRadius / starWidth, 2.0));
    float centralGlow = exp(-coreRadius * 13.0);
    color += vec3(0.94, 1.0, 0.83) * centralStar * 0.95;
    color += vec3(0.14, 0.44, 0.27) * centralGlow * 0.11;
    color += vec3(0.5, 0.62, 0.38) * spokes * exp(-coreRadius * 6.0)
      * smoothstep(0.015, 0.045, coreRadius) * 0.14;
    float ringRadius = length(coreUv * vec2(1.0, 1.55));
    float miniatureRing = exp(-pow((ringRadius - 0.105) / 0.018, 2.0));
    float miniatureDisk = exp(-pow(coreUv.y / 0.014, 2.0))
      * (1.0 - smoothstep(0.12, 0.38, abs(coreUv.x)));
    float miniatureJet = exp(-pow(coreUv.x / 0.014, 2.0))
      * smoothstep(0.11, 0.16, abs(coreUv.y))
      * (1.0 - smoothstep(0.5, 0.72, abs(coreUv.y)));
    float nativeCosmos = 1.0 - step(0.5, generation);
    color += vec3(0.9, 0.12, 0.016) * (miniatureRing * 0.45 + miniatureDisk * 0.52) * nativeCosmos;
    color += vec3(0.52, 0.14, 0.86) * miniatureJet * 0.65 * nativeCosmos;
    vec3 halfVector = normalize(normalize(vec3(-0.6, 0.75, 0.5)) - ray);
    float glint = pow(max(dot(n, halfVector), 0.0), 100.0);
    float facet = pow(max(dot(n, normalize(vec3(0.7, 0.2, 0.68))), 0.0), 18.0);
    color += vec3(0.6, 0.76, 1.0) * glint * 0.8;
    color += pearl * facet * 0.06;
    return color;
  }

  vec3 matrixGeneration(vec3 origin, vec3 ray, float generation, float zoom) {
    vec3 center;
    float id;
    float t = matrixSphereHit(origin, ray, center, id);
    if (t > 999.0) return vec3(0.0003, 0.0002, 0.0007);
    vec3 color = matrixSurface(origin, ray, center, t, id, generation);
    // These are actual 3D child clusters, not a repeated pattern painted on
    // the parent. Their transforms match the previous scale exactly, so it
    // remains nested inside the newly revealed parent as the zoom proceeds.
    vec3 childOrigin = (origin - center) * 6.85410196625;
    float weight = 0.94;
    for (int depth = 0; depth < 3; depth++) {
      float childGeneration = generation - float(depth) - 1.0;
      if (childGeneration < 0.0) break;
      t = matrixSphereHit(childOrigin, ray, center, id);
      if (t > 999.0) break;
      vec3 childNormal = normalize(childOrigin + ray * t - center);
      float resolvable = 1.0 - smoothstep(0.12, 0.45, length(fwidth(childNormal)));
      color += matrixSurface(childOrigin, ray, center, t, id, childGeneration) * weight * resolvable;
      if (resolvable < 0.01) break;
      childOrigin = (childOrigin - center) * 6.85410196625;
      weight *= 0.9;
    }
    return color;
  }

  vec3 matrixView(vec3 ray, float zoom) {
    const float SCALE = 6.85410196625; // phi^4
    float level = min(floor(zoom), 6.0);
    float phase = zoom - level;
    vec3 direction = normalize(uCameraPosition);
    // The final crystal turns before gathering into a single distant seed.
    float turn = smoothstep(6.55, 7.08, zoom) * 3.14159265 + uAscension * 0.22 * uMotion;
    ray = rotateX(rotateY(ray, turn * 0.38), turn);
    direction = rotateX(rotateY(direction, turn * 0.38), turn);
    float distance = 1.652173913 * pow(SCALE, phase);
    vec3 a = matrixGeneration(direction * distance, ray, level, zoom);
    if (level < 6.0 && phase > 0.82) {
      vec3 b = matrixGeneration(direction * (distance / SCALE), ray, level + 1.0, zoom);
      a = mix(a, b, smoothstep(0.82, 1.0, phase));
    }
    return a;
  }

  ${cloudRealmShader}

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uResolution.x / max(uResolution.y, 1.0);

    vec3 ro = uCameraPosition;
    vec3 rd = normalize(
      uCameraForward * 1.62 +
      uCameraRight * p.x +
      uCameraUp * p.y
    );
    vec3 viewRay = rd;

    if (uCloudRealm > 0.999) {
      gl_FragColor = vec4(cloudRealm(p), 1.0); return;
    }
    if (uAscension > 0.0) {
      vec3 gathered = 1.0 - exp(-matrixView(viewRay, uMacroZoom) * 1.24);
      float r = length(p);
      float spark = smoothstep(2.8, 3.85, uAscension)
        * (1.0 - smoothstep(4.2, 5.0, uAscension));
      float pin = exp(-r * r / max(0.000006, 5.0 / (uResolution.y * uResolution.y)));
      float flare = exp(-r * 24.0) * 0.18
        + exp(-abs(p.x) * 650.0 - abs(p.y) * 24.0) * 0.42
        + exp(-abs(p.y) * 650.0 - abs(p.x) * 24.0) * 0.42;
      gathered += vec3(1.0, 0.94, 0.82) * (pin + flare) * spark;
      float bloom = smoothstep(3.85, 6.4, uAscension);
      float bubbleRadius = mix(0.0, length(vec2(uResolution.x / uResolution.y, 1.0)) + 0.4, bloom);
      float inside = (1.0 - smoothstep(bubbleRadius - 0.08, bubbleRadius + 0.03, r))
        * smoothstep(3.85, 4.1, uAscension);
      float shell = exp(-pow((r - bubbleRadius) / 0.028, 2.0)) * smoothstep(3.85, 4.1, uAscension);
      vec3 color = mix(gathered, cloudRealm(p), inside);
      color += shell * vec3(0.82, 0.72, 0.94) * (1.0 - bloom) * 0.6;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0); return;
    }

    if (uRealityMix > 0.999) {
      gl_FragColor = vec4(alternateReality(viewRay), 1.0);
      return;
    }

    // Macro pixels bypass the expensive accretion-disk marcher entirely.
    // Within the original radius this branch is absent, preserving that view.
    float matrixBlend = smoothstep(0.0, 0.58, uMacroZoom);
    vec3 macroColor = vec3(0.0);
    float centralAperture = 1.0;
    if (uMacroZoom > 0.0 && uRealityMix < 0.001) {
      macroColor = matrixView(viewRay, uMacroZoom);
      vec3 macroOrigin = normalize(ro) * (1.652173913 * pow(6.85410196625, uMacroZoom));
      float b = dot(macroOrigin, viewRay);
      float apertureDistance = max(0.0, dot(macroOrigin, macroOrigin) - b * b);
      float edgeAA = max(fwidth(apertureDistance), 0.002);
      centralAperture = 1.0 - smoothstep(1.0 - edgeAA, 1.0 + edgeAA, apertureDistance);
      centralAperture *= 1.0 - smoothstep(0.7, 1.1, uMacroZoom);
      if (matrixBlend > 0.999 && centralAperture < 0.001) {
        float macroVignette = 1.0 - smoothstep(0.52, 1.4, length(p * vec2(0.62, 0.78))) * 0.46;
        gl_FragColor = vec4(1.0 - exp(-macroColor * macroVignette * 1.24), 1.0); return;
      }
      // Bounded physical camera, widening the sampling ray instead of moving
      // it beyond the range supported by the original black-hole integrator.
      float magnification = pow(6.85410196625, uMacroZoom);
      rd = normalize(uCameraForward * 1.62
        + (uCameraRight * p.x + uCameraUp * p.y) * magnification);
      viewRay = rd;
    }

    vec3 pos = ro;
    vec3 radiance = vec3(0.0);
    float transmittance = 1.0;
    float closest = 1000.0;
    float photonClosestSquared = dot(pos, pos);
    float swallowed = 0.0;
    float breath = mix(0.5, 0.5 + 0.5 * sin(uCosmicBeat * 1.5707963268), uMotion);

    for (int i = 0; i < STEPS; i++) {
      float r = length(pos);
      closest = min(closest, r);

      if (r < 0.73) {
        swallowed = 1.0;
        break;
      }

      if (r > 13.5 && dot(pos, rd) > 0.0) {
        break;
      }

      float midStepBlend = smoothstep(5.4, 6.2, r);
      float farStepBlend = smoothstep(12.5, 14.5, r);
      float stepRatio = mix(0.055, 0.09, farStepBlend);
      float stepCap = mix(0.28, 0.58, midStepBlend);
      stepCap = mix(stepCap, 3.0, farStepBlend);
      float dt = clamp(r * stepRatio, 0.025, stepCap);
      vec3 transverse = pos - rd * dot(pos, rd);
      rd = normalize(rd - transverse * (1.28 / (r * r * r + 0.045)) * dt);
      vec3 nextPos = pos + rd * dt;
      float closestSegmentDistance = clamp(-dot(pos, rd), 0.0, dt);
      vec3 closestSegmentPoint = pos + rd * closestSegmentDistance;
      photonClosestSquared = min(
        photonClosestSquared,
        dot(closestSegmentPoint, closestSegmentPoint)
      );

      // A lightweight photon atmosphere follows the same bent ray as the
      // disk. Sampling the segment's exact nearest point prevents the shell
      // from fluttering as camera distance changes.
      vec3 photonSample = closestSegmentPoint;
      float photonSampleRadius = length(photonSample);
      if (photonSampleRadius > 0.73 && photonSampleRadius < 1.36) {
        vec3 photonNormal = photonSample / photonSampleRadius;
        float photonShell = exp(-pow(
          (photonSampleRadius - 0.99) / 0.16,
          2.0
        ));
        float photonEquator = exp(-abs(photonNormal.y) * 2.6);
        float photonLimb = 1.0 - abs(dot(photonNormal, -rd));
        float photonVolume = photonShell
          * (0.42 + photonEquator * 0.58);
        float photonAlpha = (1.0 - exp(-photonVolume * dt * 1.45))
          * transmittance;
        vec3 photonColor = mix(
          vec3(0.46, 0.006, 0.0004),
          vec3(1.28, 0.19, 0.006),
          0.3 + photonEquator * 0.52
        );
        radiance += photonColor * photonAlpha * (0.2 + photonLimb * 0.46);
        transmittance *= 1.0 - photonAlpha * 0.08;
      }

      float planeDelta = nextPos.y - pos.y;
      bool trueCrossing = pos.y * nextPos.y <= 0.0 && abs(planeDelta) > 0.00001;
      float safeDelta = abs(planeDelta) > 0.00001
        ? planeDelta
        : (planeDelta >= 0.0 ? 0.00001 : -0.00001);
      float planeT = trueCrossing ? clamp(-pos.y / safeDelta, 0.0, 1.0) : 0.5;
      vec3 hit = mix(pos, nextPos, planeT);
      float crossing = trueCrossing ? 1.0 : 0.0;
      float midpointY = abs((pos.y + nextPos.y) * 0.5);
      float grazing = (1.0 - crossing)
        * (1.0 - smoothstep(0.004, 0.022, midpointY))
        * (1.0 - smoothstep(0.004, 0.028, abs(planeDelta)));
      float coverage = crossing + grazing * (0.16 + min(dt, 0.2) * 0.3);
      float radial = length(hit.xz);
      float annulus = smoothstep(1.1, 1.26, radial) * (1.0 - smoothstep(4.7, 5.25, radial));
      float density = coverage * annulus;

      if (density > 0.001) {
        float heat = clamp((5.25 - radial) / 4.15, 0.0, 1.0);
        float angle = atan(hit.z, hit.x);
        float logRadius = log(max(radial, 0.2));
        vec2 wrappedAngle = vec2(cos(angle), sin(angle)) * 2.35;
        float turbulence = flow2(
          wrappedAngle +
          vec2(logRadius * 1.55, -logRadius * 1.9) +
          vec2(-uCosmicBeat * 0.048, uCosmicBeat * 0.036)
        );
        float broadPhase = angle * 4.0 - logRadius * 10.5 - uCosmicBeat * 0.36;
        float finePhase = angle * 9.0 - logRadius * 21.0 - uCosmicBeat * 0.72;
        float broadBands = 0.5 + 0.5 * sin(broadPhase + turbulence * 3.8);
        float fineBands = 0.5 + 0.5 * sin(finePhase + turbulence * 2.2);
        float filaments = 0.36 + broadBands * 0.72 + fineBands * 0.26;
        vec3 tangent = normalize(vec3(-hit.z, 0.0, hit.x));
        float doppler = dot(tangent, -rd) * 0.5 + 0.5;
        vec3 diskColor = diskPalette(heat);
        diskColor *= mix(0.34, 1.72, pow(doppler, 1.35));
        diskColor *= (0.93 + breath * 0.07) * filaments;
        float alpha = (1.0 - exp(-density * (1.1 + filaments * 1.75))) * transmittance;
        radiance += diskColor * alpha * (0.74 + heat * 1.12);
        transmittance *= 1.0 - alpha * 0.84;
      }
      pos = nextPos;
    }

    if (swallowed < 0.5) {
      float skyGuard = mix(0.78, 1.0, smoothstep(1.05, 2.4, closest));
      vec3 distantSky = starfield(rd);
      distantSky += outerMicroStarfield(viewRay) * mix(
        0.78,
        1.0,
        smoothstep(1.4, 4.0, closest)
      );
      distantSky += crystallineComet(rd, uMusicBeat);
      radiance += distantSky * transmittance * skyGuard;
    }

    float photonClosest = sqrt(max(photonClosestSquared, 0.0));
    float photonRing = exp(-pow((photonClosest - 0.96) / 0.021, 2.0));
    float softHalo = exp(-pow((photonClosest - 1.0) / 0.2185, 2.0));
    radiance += vec3(1.34, 0.16, 0.008) * photonRing * 0.64;
    radiance += vec3(0.72, 0.025, 0.001) * softHalo * 0.028
      * (0.94 + breath * 0.06);

    radiance += quasarJets(ro, viewRay, uCosmicBeat);
    float centerT = max(dot(-ro, viewRay), 0.0);
    float centerDistance = length(ro + viewRay * centerT);
    float whitePoint = exp(-pow(centerDistance / 0.022, 2.0));
    float pointGlow = exp(-pow(centerDistance / 0.105, 2.0));
    radiance += vec3(0.92, 0.98, 1.35) * whitePoint * 3.0;
    radiance += vec3(0.14, 0.48, 1.1) * pointGlow * 0.18;
    radiance += energyNodes(ro, viewRay, uCosmicBeat);

    float vignette = 1.0 - smoothstep(0.52, 1.4, length(p * vec2(0.62, 0.78))) * 0.46;
    if (uMacroZoom > 0.0 && uRealityMix < 0.001) {
      radiance = mix(radiance, macroColor, matrixBlend * (1.0 - centralAperture));
      // Add the clear crystal rim around the original cosmic sphere.
      radiance += macroColor * matrixBlend * centralAperture * 0.5;
      radiance = mix(radiance, macroColor, smoothstep(0.7, 1.1, uMacroZoom));
    }
    radiance *= vignette;
    radiance = 1.0 - exp(-radiance * 1.24);
    if (uRealityMix > 0.001) {
      float realityBlend = smoothstep(0.0, 1.0, uRealityMix);
      float portalFlash = pow(sin(realityBlend * 3.14159265), 6.0);
      vec3 flashColor = mix(
        vec3(1.55, 0.018, 0.72),
        vec3(0.58, 0.025, 1.55),
        smoothstep(0.25, 0.75, realityBlend)
      );
      radiance = mix(radiance, alternateReality(viewRay), realityBlend);
      radiance += flashColor * portalFlash * 1.25;
      radiance += vec3(1.0, 0.34, 0.9) * portalFlash * portalFlash * 0.65;
    }
    gl_FragColor = vec4(radiance, 1.0);
  }
`;

const quaOrbVertexShader = /* glsl */ `
  varying vec2 vOrbUv;
  varying vec3 vOrbNormal;
  varying vec3 vOrbViewDirection;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vOrbUv = uv;
    vOrbNormal = normalize(normalMatrix * normal);
    vOrbViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const quaOrbFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  varying vec2 vOrbUv;
  varying vec3 vOrbNormal;
  varying vec3 vOrbViewDirection;

  float glyphBox(vec2 point, vec2 halfSize) {
    vec2 distanceToEdge = abs(point) - halfSize;
    return length(max(distanceToEdge, 0.0))
      + min(max(distanceToEdge.x, distanceToEdge.y), 0.0);
  }

  void main() {
    vec3 normalDirection = normalize(vOrbNormal);
    vec3 viewDirection = normalize(vOrbViewDirection);
    vec3 lightDirection = normalize(vec3(-0.48, 0.72, 0.82));
    float diffuseLight = max(dot(normalDirection, lightDirection), 0.0);
    float fresnel = pow(
      1.0 - clamp(dot(normalDirection, viewDirection), 0.0, 1.0),
      2.25
    );
    float highlight = pow(
      max(
        dot(reflect(-lightDirection, normalDirection), viewDirection),
        0.0
      ),
      110.0
    );

    float longitude = mod(vOrbUv.x - 0.25 + 0.5, 1.0) - 0.5;
    float latitude = vOrbUv.y - 0.5;
    float longitudeRadians = longitude * 6.28318530718;
    float latitudeRadians = latitude * 3.14159265359;
    float pearlFlow = 0.5 + 0.5 * sin(
      longitudeRadians * 3.0
        + latitudeRadians * 3.2
        + sin(latitudeRadians * 6.0 - uTime * 0.13) * 1.4
        + uTime * 0.18
    );
    float blueFlow = 0.5 + 0.5 * sin(
      longitudeRadians * 4.0
        - latitudeRadians * 4.15
        - uTime * 0.11
    );

    float helixDistanceA = abs(sin(
      longitudeRadians * 2.0
        + latitudeRadians * 3.15
        + sin(latitudeRadians * 2.0) * 0.28
        + uTime * 0.045
    ));
    float helixDistanceB = abs(sin(
      longitudeRadians * 2.0
        - latitudeRadians * 3.15
        - sin(latitudeRadians * 2.0) * 0.28
        - 0.92
        + uTime * 0.045
    ));
    float bioCircuit = 1.0 - smoothstep(
      0.025,
      0.095,
      min(helixDistanceA, helixDistanceB)
    );
    float nodeField = max(
      cos(longitudeRadians * 6.0 + latitudeRadians * 0.7)
        * cos(latitudeRadians * 7.0 - longitudeRadians),
      0.0
    );
    float crystalNodes = pow(nodeField, 20.0);
    float innerCaustic = pow(
      0.5 + 0.5 * sin(
        longitudeRadians * 3.0
          - latitudeRadians * 5.0
          + sin(longitudeRadians * 2.0 + uTime * 0.12)
          + uTime * 0.09
      ),
      8.0
    );
    float livingPulse = 0.8 + 0.2 * sin(
      uTime * 0.42
        + longitudeRadians * 2.0
        - latitudeRadians * 2.4
    );

    vec3 pinkPearl = vec3(0.9, 0.45, 0.67);
    vec3 aquaBiolight = vec3(0.42, 0.86, 1.08);
    vec3 amethystBiolight = vec3(0.69, 0.48, 1.02);
    // Saturated mineral inclusions, with enough transmitted light for black inlay.
    vec3 clearQuartz = mix(vec3(0.12, 0.45, 0.95), vec3(0.66, 0.19, 0.88), pearlFlow);
    clearQuartz = mix(clearQuartz, vec3(0.96, 0.28, 0.60), blueFlow * pearlFlow * 0.82);
    vec3 surfaceColor = clearQuartz * (0.88 + blueFlow * 0.12) + vec3(0.10, 0.085, 0.13);
    vec3 iridescence = 0.5 + 0.5 * cos(
      5.8 * fresnel + uTime * 0.08 + vec3(0.0, 2.05, 4.1)
    );
    vec3 color = surfaceColor * (0.58 + diffuseLight * 0.42);
    color += iridescence * fresnel * 0.26;
    color += vec3(0.96, 0.98, 1.0) * highlight * 1.8;
    vec3 circuitColor = mix(
      aquaBiolight,
      amethystBiolight,
      0.5 + 0.5 * sin(longitudeRadians + latitudeRadians * 2.0)
    );
    color += circuitColor
      * bioCircuit
      * livingPulse
      * (0.015 + fresnel * 0.018);
    color += vec3(0.82, 0.91, 1.28)
      * crystalNodes
      * (0.065 + highlight * 0.18);
    color += mix(aquaBiolight, pinkPearl, pearlFlow)
      * innerCaustic
      * 0.025
      * (1.0 - fresnel);
    color += vec3(0.28, 0.12, 0.62) * fresnel * fresnel * 0.055;

    vec2 artworkPoint = vec2(longitude * 2.0, latitude);
    // Opaque black inlays and circular counters follow the supplied
    // geometric wordmark reference; all marks remain part of the 3D surface.
    vec2 qPoint = artworkPoint - vec2(-0.194, 0.0);
    float qBody = max(
      glyphBox(qPoint, vec2(0.068, 0.079)),
      -(length(qPoint) - 0.038)
    );
    vec2 qTailPoint = qPoint - vec2(0.042, -0.042);
    vec2 qTailAxes = vec2(
      qTailPoint.x - qTailPoint.y,
      qTailPoint.x + qTailPoint.y
    ) * 0.70710678118;
    float qDistance = min(qBody, glyphBox(qTailAxes, vec2(0.057, 0.011)));

    vec2 uPoint = artworkPoint;
    float uCounter = min(
      length(uPoint - vec2(0.0, -0.012)) - 0.033,
      glyphBox(uPoint - vec2(0.0, 0.05), vec2(0.033, 0.062))
    );
    float uDistance = max(glyphBox(uPoint, vec2(0.064, 0.079)), -uCounter);

    vec2 aPoint = artworkPoint - vec2(0.194, 0.0);
    float aOuter = max(
      (abs(aPoint.x) + 0.48125 * aPoint.y - 0.0385) / 1.1098,
      -aPoint.y - 0.079
    );
    float aCounter = min(
      length(aPoint - vec2(0.0, -0.008)) - 0.022,
      glyphBox(aPoint - vec2(0.0, -0.058), vec2(0.006, 0.03))
    );
    float aDistance = max(aOuter, -aCounter);
    float artworkDistance = min(qDistance, min(uDistance, aDistance));
    float artworkMask = 1.0 - smoothstep(-0.0025, 0.003, artworkDistance);
    float artworkAura = 1.0 - smoothstep(0.003, 0.01, artworkDistance);
    float engravedEdge = max(artworkAura - artworkMask, 0.0);
    vec3 letterInk = vec3(0.0012, 0.0015, 0.0021);
    vec3 artworkColor = letterInk + vec3(0.008, 0.01, 0.016) * highlight * 0.22;
    color *= 1.0 - engravedEdge * 0.18;
    color += vec3(0.82, 0.9, 1.0) * engravedEdge * 0.035;
    color = mix(color, artworkColor, artworkMask);
    float glassAlpha = mix(0.88, 0.97, fresnel);
    gl_FragColor = vec4(color, mix(glassAlpha, 1.0, artworkMask));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const MUSIC_BPM = 135;
const MUSIC_LAYERS = { hats: 1, shaker: 2, pad: 4, pulse: 8, dub: 16, clap: 32 };
const MUSIC_LAYER_BITS = [1, 2, 4, 8, 16, 32];
const BASE_TRACKS = [
  { id: 'deep', label: 'Deep', description: 'Submerged chords and a deep rolling bass' },
  { id: 'glass', label: 'Glass', description: 'Crystalline echoes and a syncopated bass' },
  { id: 'velvet', label: 'Velvet', description: 'Warm suspended chords and a spacious pulse' },
] as const;
type BaseTrack = typeof BASE_TRACKS[number]['id'];

type DubTechnoEngine = {
  start: () => Promise<boolean>;
  setMuted: (muted: boolean) => void;
  setMovement: (mask: number) => void;
  setTrack: (track: BaseTrack) => void;
  getBeat: () => number | null;
  dispose: () => void;
};

type WebKitAudioWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

type IdleWindow = typeof window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function createDubTechnoEngine(): DubTechnoEngine | null {
  const AudioContextClass = window.AudioContext
    ?? (window as WebKitAudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;

  let context: AudioContext;
  try {
    context = new AudioContextClass({ latencyHint: 'playback' });
  } catch {
    try {
      context = new AudioContextClass();
    } catch {
      return null;
    }
  }

  const bpm = MUSIC_BPM;
  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / 2;
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const lowHighpass = context.createBiquadFilter();
  const lowLowpass = context.createBiquadFilter();
  const upperHighpass = context.createBiquadFilter();
  const midScoop = context.createBiquadFilter();
  const echo = context.createDelay(1.2);
  const echoHighpass = context.createBiquadFilter();
  const echoLowpass = context.createBiquadFilter();
  const echoFeedback = context.createGain();
  const reverb = context.createConvolver();
  const reverbGain = context.createGain();
  const noiseBuffer = context.createBuffer(
    1,
    Math.round(context.sampleRate * 1.6),
    context.sampleRate,
  );

  master.gain.value = 0.0001;
  compressor.threshold.value = -22;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.015;
  compressor.release.value = 0.32;
  lowHighpass.type = 'highpass';
  lowHighpass.frequency.value = 50;
  lowHighpass.Q.value = Math.SQRT1_2;
  lowLowpass.type = 'lowpass';
  lowLowpass.frequency.value = 200;
  lowLowpass.Q.value = Math.SQRT1_2;
  lowHighpass.connect(lowLowpass);
  lowLowpass.connect(master);
  upperHighpass.type = 'highpass';
  upperHighpass.frequency.value = 856;
  upperHighpass.Q.value = Math.SQRT1_2;
  upperHighpass.connect(master);
  midScoop.type = 'peaking';
  midScoop.frequency.value = Math.sqrt(200 * 850);
  midScoop.Q.value = 0.65;
  midScoop.gain.value = -14;
  master.connect(midScoop);
  midScoop.connect(compressor);
  compressor.connect(context.destination);

  echo.delayTime.value = secondsPerBeat * 0.75;
  echoHighpass.type = 'highpass';
  echoHighpass.frequency.value = 856;
  echoLowpass.type = 'lowpass';
  echoLowpass.frequency.value = 4200;
  echoLowpass.Q.value = 0.8;
  echoFeedback.gain.value = 0.53;
  echo.connect(echoHighpass);
  echoHighpass.connect(echoLowpass);
  echoLowpass.connect(echoFeedback);
  echoFeedback.connect(echo);
  echoLowpass.connect(upperHighpass);

  const impulseLength = Math.round(context.sampleRate * 2.2);
  const impulse = context.createBuffer(2, impulseLength, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < impulseLength; index += 1) {
      const progress = index / impulseLength;
      const diffusion = Math.sin(index * (channel === 0 ? 0.071 : 0.083)) * 0.13;
      samples[index] = (Math.random() * 2 - 1 + diffusion)
        * Math.pow(1 - progress, 2.75)
        * 0.62;
    }
  }
  reverb.buffer = impulse;
  reverbGain.gain.value = 0.34;
  reverb.connect(reverbGain);
  reverbGain.connect(upperHighpass);

  const noiseSamples = noiseBuffer.getChannelData(0);
  let smoothedNoise = 0;
  for (let index = 0; index < noiseSamples.length; index += 1) {
    smoothedNoise = smoothedNoise * 0.82 + (Math.random() * 2 - 1) * 0.18;
    noiseSamples[index] = smoothedNoise;
  }

  let scheduler: number | null = null;
  let muteTimer: number | null = null;
  let noiseBed: AudioBufferSourceNode | null = null;
  let nextStepTime = 0;
  let stepIndex = 0;
  let originTime = 0;
  let running = false;
  let muted = false;
  let wantsPlayback = false;
  let movementMask = 0;
  let pendingTriggers = 0;
  const releaseUntil = new Float64Array(MUSIC_LAYER_BITS.length);
  let requestedTrack: BaseTrack = 'deep';
  let currentTrack: BaseTrack = 'deep';
  let playbackRequest = 0;
  let nextPadStep = 0;

  const connectSend = (
    source: AudioNode,
    destination: AudioNode,
    level: number,
  ) => {
    if (level <= 0) return;
    const send = context.createGain();
    send.gain.value = level;
    source.connect(send);
    send.connect(destination);
  };

  const routeVoice = (
    source: AudioNode,
    dryLevel: number,
    echoLevel: number,
    reverbLevel: number,
    lowRegister = false,
  ) => {
    connectSend(source, lowRegister ? lowHighpass : upperHighpass, dryLevel);
    connectSend(source, echo, echoLevel);
    connectSend(source, reverb, reverbLevel);
  };

  const scheduleKick = (time: number, accent: number) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(130, time);
    oscillator.frequency.exponentialRampToValueAtTime(55, time + 0.18);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.34 * accent, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    oscillator.connect(envelope);
    routeVoice(envelope, 0.9, 0, 0, true);
    oscillator.start(time);
    oscillator.stop(time + 0.34);
  };

  const scheduleHat = (time: number, accent: number) => {
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 5200;
    highpass.Q.value = 0.7;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.18 * accent, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.085);
    source.connect(highpass);
    highpass.connect(envelope);
    routeVoice(envelope, 0.7, 0.09, 0.12);
    source.start(time, (stepIndex * 0.173) % 1.35);
    source.stop(time + 0.1);
  };

  const scheduleCrash = (time: number) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2600, time);
    filter.frequency.exponentialRampToValueAtTime(6200, time + 1.5);
    filter.Q.value = 0.65;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.7, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 1.7);
    source.connect(filter);
    filter.connect(envelope);
    routeVoice(envelope, 0.75, 0.12, 0.45);
    source.start(time);
    source.stop(time + 1.75);
    // Inharmonic metal over the noise wash gives the opening crash its shimmer.
    [3169, 4523, 6173].forEach((frequency) => {
      const metal = context.createOscillator();
      const level = context.createGain();
      metal.type = 'triangle';
      metal.frequency.value = frequency;
      level.gain.value = 0.025;
      metal.connect(level);
      level.connect(envelope);
      metal.start(time);
      metal.stop(time + 1.75);
    });
  };

  const scheduleShaker = (time: number, accent: number) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = 7200;
    filter.Q.value = 1.15;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.21 * accent, time + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.105);
    source.connect(filter);
    filter.connect(envelope);
    routeVoice(envelope, 0.7, 0.05, 0.08);
    source.start(time, (stepIndex * 0.219) % 1.3);
    source.stop(time + 0.12);
  };

  const scheduleBass = (time: number, variation: number) => {
    const fundamental = context.createOscillator();
    const harmonic = context.createOscillator();
    const envelope = context.createGain();
    const root = currentTrack === 'glass' ? (variation === 2 ? 82.41 : 65.41)
      : currentTrack === 'velvet' ? (variation === 2 ? 69.3 : 58.27)
      : variation === 2 ? 65.41 : 73.42;
    fundamental.type = 'sine';
    harmonic.type = 'sine';
    fundamental.frequency.value = root;
    harmonic.frequency.value = root * 2;
    harmonic.detune.value = -4;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.12, time + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.52);
    fundamental.connect(envelope);
    harmonic.connect(envelope);
    routeVoice(envelope, 0.84, 0, 0, true);
    fundamental.start(time);
    harmonic.start(time);
    fundamental.stop(time + 0.58);
    harmonic.stop(time + 0.58);
  };

  const scheduleChord = (time: number, variation: number, intensity = 1) => {
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const frequencies = currentTrack === 'glass'
      ? [1046.5, 1318.51, 1567.98, 1760]
      : currentTrack === 'velvet' ? [932.33, 1108.73, 1396.91, 1661.22]
      : variation === 1
      ? [880, 1174.66, 1318.51, 1396.91]
      : [880, 1046.5, 1174.66, 1318.51];
    const detunes = [-7, 3, -3, 6];

    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(1700, time);
    filter.frequency.exponentialRampToValueAtTime(
      variation === 2 ? 3400 : 4200,
      time + 0.055,
    );
    filter.frequency.exponentialRampToValueAtTime(1500, time + 0.64);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.075 * intensity, time + 0.014);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.72);
    filter.connect(envelope);
    routeVoice(envelope, 0.34, 0.62, 0.46);

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detunes[index];
      oscillator.connect(filter);
      oscillator.start(time);
      oscillator.stop(time + 0.82);
    });
  };

  const scheduleAir = (time: number) => {
    const envelope = context.createGain();
    const frequencies = currentTrack === 'velvet' ? [932.33, 1396.91, 1864.66]
      : currentTrack === 'glass' ? [1046.5, 1567.98, 2093] : [880, 1318.51, 1760];
    const duration = secondsPerBeat * 4;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.033, time + 0.19);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    routeVoice(envelope, 0.6, 0.42, 0.6);
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 3 - 3;
      oscillator.connect(envelope);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.05);
    });
  };

  const scheduleClap = (time: number) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, time);
    filter.frequency.exponentialRampToValueAtTime(1450, time + 0.22);
    filter.Q.value = 0.65;
    // Three tightly spaced handclap flams followed by a snare-like noise tail.
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.65, time + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.06, time + 0.010);
    envelope.gain.exponentialRampToValueAtTime(0.82, time + 0.013);
    envelope.gain.exponentialRampToValueAtTime(0.08, time + 0.021);
    envelope.gain.exponentialRampToValueAtTime(0.95, time + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    source.connect(filter);
    filter.connect(envelope);
    routeVoice(envelope, 0.8, 0.035, 0.24);
    source.start(time, (stepIndex * 0.173) % 1.2);
    source.stop(time + 0.26);

    const body = context.createOscillator();
    const bodyEnvelope = context.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(180, time);
    body.frequency.exponentialRampToValueAtTime(105, time + 0.065);
    bodyEnvelope.gain.setValueAtTime(0.0001, time);
    bodyEnvelope.gain.exponentialRampToValueAtTime(0.10, time + 0.004);
    bodyEnvelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    body.connect(bodyEnvelope);
    routeVoice(bodyEnvelope, 0.8, 0, 0, true);
    body.start(time);
    body.stop(time + 0.11);
  };

  const scheduleStep = (index: number, time: number) => {
    const patternStep = index % 16;
    if (index % 8 === 0 && currentTrack !== requestedTrack) {
      currentTrack = requestedTrack;
      echoFeedback.gain.setTargetAtTime(currentTrack === 'glass' ? 0.58 : currentTrack === 'velvet' ? 0.46 : 0.53, time, 0.15);
      echoLowpass.frequency.setTargetAtTime(currentTrack === 'glass' ? 5400 : currentTrack === 'velvet' ? 3000 : 4200, time, 0.15);
    }
    if (patternStep % 2 === 0) {
      scheduleKick(time, (patternStep % 8 === 0 ? 1 : 0.76) * (currentTrack === 'velvet' ? 0.83 : 1));
    }
    const bassPattern = currentTrack === 'glass' ? [0, 3, 8, 11, 14]
      : currentTrack === 'velvet' ? [0, 7, 12] : [0, 6, 8, 12];
    if (bassPattern.includes(patternStep)) {
      scheduleBass(time, Math.floor(index / 16) % 4);
    }
    // A sparse bed leaves space for the visitor's movements to play the track.
    if (index % 32 === 15) scheduleChord(time, Math.floor(index / 32) % 3, 0.32);
    const triggers = pendingTriggers;
    pendingTriggers = 0;
    let loopingMask = wantsPlayback ? movementMask : 0;
    MUSIC_LAYER_BITS.forEach((layer, layerIndex) => {
      if (time < releaseUntil[layerIndex]) loopingMask |= layer;
    });
    const plays = (layer: number, subdivision: boolean) =>
      Boolean((triggers & layer) || ((loopingMask & layer) && subdivision));
    if (plays(MUSIC_LAYERS.hats, index % 2 === 1)) scheduleHat(time, index % 4 === 3 ? 1.4 : 1);
    if (plays(MUSIC_LAYERS.shaker, true)) {
      scheduleShaker(time, 1);
      scheduleShaker(time + secondsPerStep * 0.52, 0.6);
    }
    if (plays(MUSIC_LAYERS.pad, index >= nextPadStep) && index >= nextPadStep) {
      scheduleAir(time);
      nextPadStep = index + 8;
    }
    if (plays(MUSIC_LAYERS.pulse, index % 4 === 2)) scheduleKick(time, 0.38);
    if (plays(MUSIC_LAYERS.dub, index % 4 === 3)) scheduleChord(time, Math.floor(index / 8) % 3);
    // Eighth-note steps 2 and 6 are beats 2 and 4. Never fire off-grid on press.
    if ((loopingMask & MUSIC_LAYERS.clap) && index % 4 === 2) scheduleClap(time);
  };

  const scheduleAhead = () => {
    const horizon = context.currentTime + 0.1;
    if (nextStepTime < context.currentTime + 0.005) {
      const skippedSteps = Math.ceil(
        (context.currentTime + 0.005 - nextStepTime) / secondsPerStep,
      );
      stepIndex += skippedSteps;
      nextStepTime += skippedSteps * secondsPerStep;
    }
    while (nextStepTime < horizon) {
      scheduleStep(stepIndex, nextStepTime);
      stepIndex += 1;
      nextStepTime += secondsPerStep;
    }
  };

  const startNoiseBed = () => {
    if (noiseBed) return;
    const source = context.createBufferSource();
    const bandpass = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    source.loop = true;
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1700;
    bandpass.Q.value = 0.45;
    envelope.gain.value = 0.012;
    source.connect(bandpass);
    bandpass.connect(envelope);
    routeVoice(envelope, 0.32, 0.12, 0.18);
    source.start();
    noiseBed = source;
  };

  const startScheduler = () => {
    scheduleAhead();
    if (scheduler === null) {
      scheduler = window.setInterval(scheduleAhead, 45);
    }
  };

  const stopScheduler = () => {
    if (scheduler !== null) window.clearInterval(scheduler);
    scheduler = null;
  };

  return {
    start: async () => {
      if (context.state === 'closed') return false;
      if (running && !muted && context.state === 'running') return true;
      const request = ++playbackRequest;
      wantsPlayback = true;
      try {
        await context.resume();
      } catch {
        if (request === playbackRequest) {
          wantsPlayback = false;
          pendingTriggers = 0;
        }
        return false;
      }
      if (context.state !== 'running' || request !== playbackRequest) return false;

      if (muteTimer !== null) window.clearTimeout(muteTimer);
      muteTimer = null;

      const firstStart = !running;
      if (firstStart) {
        running = true;
        originTime = context.currentTime + 0.055;
        nextStepTime = originTime;
        stepIndex = 0;
        startNoiseBed();
        scheduleCrash(originTime);
      }
      pendingTriggers |= movementMask;
      startScheduler();

      muted = false;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(
        Math.max(master.gain.value, 0.0001),
        context.currentTime,
      );
      master.gain.exponentialRampToValueAtTime(0.22, context.currentTime + (firstStart ? 0.045 : 0.3));
      return true;
    },
    setMuted: (nextMuted: boolean) => {
      if (context.state === 'closed') return;
      muted = nextMuted;
      wantsPlayback = !muted;
      if (muted) playbackRequest += 1;
      const now = context.currentTime;
      if (muteTimer !== null) window.clearTimeout(muteTimer);
      muteTimer = null;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.exponentialRampToValueAtTime(
        muted ? 0.0001 : 0.22,
        now + (muted ? 0.22 : 0.5),
      );
      if (muted) {
        pendingTriggers = 0;
        releaseUntil.fill(0);
        muteTimer = window.setTimeout(() => {
          muteTimer = null;
          if (!muted || context.state === 'closed') return;
          stopScheduler();
          void context.suspend();
        }, 280);
      }
    },
    setMovement: (mask) => {
      if (mask === movementMask) return;
      if (wantsPlayback) {
        const pressed = mask & ~movementMask;
        const released = movementMask & ~mask;
        pendingTriggers |= pressed;
        MUSIC_LAYER_BITS.forEach((layer, layerIndex) => {
          if (pressed & layer) releaseUntil[layerIndex] = 0;
          if (released & layer) releaseUntil[layerIndex] = context.currentTime + 8;
        });
      }
      movementMask = mask;
    },
    setTrack: (track) => {
      requestedTrack = track;
    },
    getBeat: () => {
      if (!running || context.state !== 'running') return null;
      return Math.max(0, (context.currentTime - originTime) / secondsPerBeat);
    },
    dispose: () => {
      playbackRequest += 1;
      wantsPlayback = false;
      stopScheduler();
      if (muteTimer !== null) window.clearTimeout(muteTimer);
      muteTimer = null;
      try {
        noiseBed?.stop();
      } catch {
        // The source may already have been released by the browser.
      }
      noiseBed = null;
      void context.close();
    },
  };
}

type QuaOrbProps = {
  active: boolean;
};

function QuaOrb({ active }: QuaOrbProps) {
  const orbCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = orbCanvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        premultipliedAlpha: false,
      });
    } catch {
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 10);
    camera.position.z = 3.8;
    const geometry = new THREE.SphereGeometry(1, 28, 18);
    const uniforms = { uTime: { value: 0 } };
    const material = new THREE.ShaderMaterial({
      vertexShader: quaOrbVertexShader,
      fragmentShader: quaOrbFragmentShader,
      uniforms,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
      toneMapped: true,
    });
    const orb = new THREE.Mesh(geometry, material);
    orb.rotation.x = -0.07;
    scene.add(orb);

    let animationFrame = 0;
    let lastTimestamp = performance.now();
    let elapsedTime = 0;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;

    const renderFrame = () => {
      uniforms.uTime.value = elapsedTime;
      renderer.render(scene, camera);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderFrame();
    };

    const animate = (timestamp: number) => {
      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;
      elapsedTime += delta;
      orb.rotation.y += delta * (Math.PI * 2 / 36);
      renderFrame();
      animationFrame = window.requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
      lastTimestamp = performance.now();

      if (reducedMotion || document.hidden) {
        renderFrame();
        return;
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      startAnimation();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    motionQuery.addEventListener('change', onMotionPreferenceChange);
    document.addEventListener('visibilitychange', startAnimation);
    resize();
    startAnimation();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      motionQuery.removeEventListener('change', onMotionPreferenceChange);
      document.removeEventListener('visibilitychange', startAnimation);
      scene.remove(orb);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, []);

  return (
    <div
      className={`qua-orb ${active ? 'qua-orb--active' : ''}`}
      role="img"
      aria-label="QUA art project"
    >
      <canvas
        ref={orbCanvasRef}
        className="qua-orb__canvas"
        aria-hidden="true"
      />
    </div>
  );
}

export default function BlackHoleExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioEngineRef = useRef<DubTechnoEngine | null>(null);
  const audioAutoStartAttemptedRef = useRef(false);
  const audioWantedRef = useRef(false);
  const baseTrackRef = useRef<BaseTrack>('deep');
  const guideChoiceRef = useRef<((choice: GuideChoice) => void) | null>(null);
  const guidePanelRef = useRef<HTMLElement>(null);
  const guideTurnRef = useRef(0);
  const guideSteerRef = useRef(0);
  const guideDragRef = useRef<{ id: number; x: number } | null>(null);
  const musicDockRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [alternateRealityActive, setAlternateRealityActive] = useState(false);
  const [supported, setSupported] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [baseTrack, setBaseTrack] = useState<BaseTrack>('deep');
  const [ascensionActive, setAscensionActive] = useState(false);
  const [guideStage, setGuideStage] = useState<GuideStage>('hidden');
  const [musicMenuOpen, setMusicMenuOpen] = useState(false);

  const advanceGuide = () => {
    if (guideStage === 'arrival') setGuideStage('wisdom');
    else if (guideStage === 'wisdom') setGuideStage('question');
    else if (guideStage === 'zero' || guideStage === 'one') {
      guideChoiceRef.current?.(guideStage === 'zero' ? 0 : 1);
    }
  };

  useEffect(() => {
    if (guideStage === 'hidden') return;
    guidePanelRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const onGuideKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (guideStage === 'question' && (event.key === '0' || event.key === '1')) {
        event.preventDefault();
        setGuideStage(event.key === '0' ? 'zero' : 'one');
      } else if ((event.key === 'Enter' || event.key === ' ') && !(event.target as HTMLElement)?.closest('button')) {
        event.preventDefault();
        advanceGuide();
      }
    };
    window.addEventListener('keydown', onGuideKey);
    return () => window.removeEventListener('keydown', onGuideKey);
  }, [guideStage]);

  useEffect(() => {
    if (!musicMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!musicDockRef.current?.contains(event.target as Node)) setMusicMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMusicMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [musicMenuOpen]);

  const startAudio = () => {
    audioAutoStartAttemptedRef.current = true;
    audioWantedRef.current = true;
    let engine = audioEngineRef.current;
    if (!engine) {
      engine = createDubTechnoEngine();
      audioEngineRef.current = engine;
    }
    if (!engine) return;

    engine.setTrack(baseTrackRef.current);
    void engine.start().then((started) => {
      if (started && audioWantedRef.current && audioEngineRef.current === engine) setSoundOn(true);
    });
  };

  const toggleAudio = () => {
    const engine = audioEngineRef.current;
    if (audioWantedRef.current) {
      audioWantedRef.current = false;
      engine?.setMuted(true);
      setSoundOn(false);
      return;
    }
    startAudio();
  };

  const unlockAudio = () => {
    if (!audioAutoStartAttemptedRef.current || audioWantedRef.current) startAudio();
  };

  const chooseTrack = (track: BaseTrack) => {
    baseTrackRef.current = track;
    setBaseTrack(track);
    audioEngineRef.current?.setTrack(track);
    if (!audioAutoStartAttemptedRef.current || audioWantedRef.current) startAudio();
  };

  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let disposed = false;
    let idleHandle: number | null = null;
    let fallbackTimer: number | null = null;
    const prepareAudio = () => {
      if (disposed || audioEngineRef.current) return;
      audioEngineRef.current = createDubTechnoEngine();
      audioEngineRef.current?.setTrack(baseTrackRef.current);
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(prepareAudio, { timeout: 1600 });
    } else {
      fallbackTimer = window.setTimeout(prepareAudio, 850);
    }

    return () => {
      disposed = true;
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      audioEngineRef.current?.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch {
      window.setTimeout(() => setSupported(false), 0);
      return;
    }

    const initialBounds = canvas.getBoundingClientRect();
    const initialWidth = Math.max(1, Math.round(initialBounds.width));
    const initialHeight = Math.max(1, Math.round(initialBounds.height));
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const renderScale = coarsePointer ? 0.62 : initialWidth < 768 ? 0.72 : 0.88;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderScale));
    renderer.setSize(initialWidth, initialHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const uniforms = {
      uResolution: { value: new THREE.Vector2(initialWidth, initialHeight) },
      uCosmicBeat: { value: 0 },
      uMusicBeat: { value: 0 },
      uCometSeed: { value: Math.random() * 997 },
      uAltBeat: { value: 0 },
      uRealityMix: { value: 0 },
      uAltDistance: { value: BOX_REALM_ENTRY.distance },
      uBoxTurn: { value: new THREE.Vector2(BOX_REALM_ENTRY.boxYaw, BOX_REALM_ENTRY.boxPitch) },
      uCameraPosition: { value: new THREE.Vector3(0.35, 1.05, 9.25) },
      uCameraForward: { value: new THREE.Vector3(0, -0.06, -1).normalize() },
      uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
      uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
      uMotion: { value: reducedMotion ? 0 : 1 },
      uMacroZoom: { value: 0 },
      uAscension: { value: 0 },
      uCloudRealm: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    scene.add(new THREE.Mesh(geometry, material));
    const cosmicGuide = createCosmicGuide();
    cosmicGuide.resize(initialWidth, initialHeight);

    const position = uniforms.uCameraPosition.value;
    const forward = uniforms.uCameraForward.value;
    const right = uniforms.uCameraRight.value;
    const up = uniforms.uCameraUp.value;
    const boxTurn = uniforms.uBoxTurn.value;
    const keys = new Set<string>();
    const initialAzimuth = 0.038;
    const initialElevation = 0.112;
    const initialRadius = COSMIC_ENTRY_RADIUS;
    const cosmicMinRadius = 1.55;
    const cosmicMaxRadius = COSMIC_DETAIL_RADIUS * MATRIX_SCALE ** MATRIX_ZOOM_END;
    const idleNearRadius = 3.35;
    const idleFarRadius = COSMIC_DETAIL_RADIUS;
    const alternateEntryDistance = BOX_REALM_ENTRY.distance;
    const alternateCrossDistance = 1.1;
    const alternateMaxDistance = alternateEntryDistance * Math.exp(TIDAL_ZOOM_END);
    const idleBpm = MUSIC_BPM;
    const idleCameraBpm = MUSIC_BPM / 4;
    const idleFlowSpeed = 1.04;
    const idleZoomOneWayBeats = 175;
    const idleZoomOneWaySeconds = idleZoomOneWayBeats * 60 / idleCameraBpm;
    const activeBpm = idleBpm / 1.13;
    let azimuth = initialAzimuth;
    let elevation = initialElevation;
    let radius = initialRadius;
    let targetAzimuth = azimuth;
    let targetElevation = elevation;
    let targetRadius = radius;
    let alternateDistance = alternateEntryDistance;
    let targetAlternateDistance = alternateDistance;
    let boxYaw = BOX_REALM_ENTRY.boxYaw;
    let boxPitch = BOX_REALM_ENTRY.boxPitch;
    let idleBeatPhase = 0;
    let idleZoomPhase = 0;
    let idleViewBlend = 0;
    let wasCosmicIdle = false;
    let audioBeatOffset: number | null = null;
    let realityMix = 0;
    let realityPhase: 'cosmic' | 'entering' | 'alternate' | 'returning' | 'collapsing' | 'guide' = 'cosmic';
    let ascensionTime = 0;
    let suppressZoomUntilKeyUp = false;
    let entryResetApplied = false;
    let exitResetApplied = false;
    let destinationRequested = false;
    let frame = 0;
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let lastPinchDistance = 0;
    const touchPointers = new Map<number, { x: number; y: number }>();
    let visible = !document.hidden;
    let lastFrameTime = performance.now();
    let lastInteractionTime = performance.now();
    const navigationKeys = new Set(['a', 'd', 'w', 's', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'r']);

    const markInteraction = () => { lastInteractionTime = performance.now(); };
    let gestureMask = 0;
    let gestureUntil = 0;
    const playGesture = (mask: number) => {
      gestureMask = mask;
      gestureUntil = performance.now() + 520;
      syncMovement();
    };
    const syncMovement = () => {
      let mask = dragging || performance.now() < gestureUntil ? gestureMask : 0;
      const left = keys.has('a') || keys.has('arrowleft');
      const right = keys.has('d') || keys.has('arrowright');
      const above = keys.has('e') || keys.has('arrowup');
      const below = keys.has('q') || keys.has('arrowdown');
      if (left !== right) mask |= left ? MUSIC_LAYERS.hats : MUSIC_LAYERS.shaker;
      if (above !== below) mask |= above ? MUSIC_LAYERS.pad : MUSIC_LAYERS.pulse;
      if (keys.has('w') !== keys.has('s')) mask |= keys.has('w') ? MUSIC_LAYERS.dub : MUSIC_LAYERS.clap;
      if ((realityPhase !== 'cosmic' && realityPhase !== 'alternate') || !visible) mask = 0;
      audioEngineRef.current?.setMovement(mask);
    };
    const playOrbitGesture = (dx: number, dy: number) => {
      if (Math.abs(dx) + Math.abs(dy) < 1.5) return;
      // Follow the screen gesture: left/right percussion, upward/downward tones.
      let mask = 0;
      if (Math.abs(dx) > Math.abs(dy) * 0.6) mask |= dx < 0 ? MUSIC_LAYERS.hats : MUSIC_LAYERS.shaker;
      if (Math.abs(dy) > Math.abs(dx) * 0.6) mask |= dy < 0 ? MUSIC_LAYERS.pad : MUSIC_LAYERS.pulse;
      playGesture(mask);
    };

    const updateBasis = () => {
      const physicalRadius = Math.min(radius, COSMIC_DETAIL_RADIUS);
      const horizontalRadius = Math.cos(elevation) * physicalRadius;
      position.set(
        Math.sin(azimuth) * horizontalRadius,
        Math.sin(elevation) * physicalRadius,
        Math.cos(azimuth) * horizontalRadius,
      );
      forward.copy(position).multiplyScalar(-1).normalize();
      right.set(Math.cos(azimuth), 0, -Math.sin(azimuth)).normalize();
      up.crossVectors(right, forward).normalize();
      uniforms.uMacroZoom.value = Math.max(0, Math.log(radius / COSMIC_DETAIL_RADIUS) / Math.log(MATRIX_SCALE));
    };

    const applyAlternateEntryPose = () => {
      azimuth = targetAzimuth = BOX_REALM_ENTRY.azimuth;
      elevation = targetElevation = BOX_REALM_ENTRY.elevation;
      alternateDistance = targetAlternateDistance = alternateEntryDistance;
      boxYaw = BOX_REALM_ENTRY.boxYaw;
      boxPitch = BOX_REALM_ENTRY.boxPitch;
      boxTurn.set(boxYaw, boxPitch);
      updateBasis();
    };

    const onPointerMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (realityPhase !== 'cosmic' && realityPhase !== 'alternate') return;
      if (event.movementX !== 0 || event.movementY !== 0) markInteraction();
      playOrbitGesture(event.movementX, event.movementY);
      targetAzimuth -= event.movementX * POINTER_LOCK_MOUSE_SENSITIVITY;
      targetElevation -= event.movementY * POINTER_LOCK_MOUSE_SENSITIVITY;
    };

    const onPointerLock = () => {
      const isActive = document.pointerLockElement === canvas;
      setActive(isActive);
      markInteraction();
      if (!isActive) {
        keys.clear();
        gestureMask = 0;
        gestureUntil = 0;
        syncMovement();
      }
    };

    const onCanvasPointerDown = (event: PointerEvent) => {
      if (realityPhase !== 'cosmic' && realityPhase !== 'alternate') return;
      if (document.pointerLockElement === canvas) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.cancelable) event.preventDefault();
      dragging = true;
      setActive(true);
      markInteraction();
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (event.pointerType === 'touch') {
        touchPointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (touchPointers.size === 2) {
          gestureMask = 0;
          syncMovement();
          const points = [...touchPointers.values()];
          lastPinchDistance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
        }
      }
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be unavailable during an interrupted iOS gesture.
      }
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      if (!dragging || document.pointerLockElement === canvas) return;
      if (event.cancelable) event.preventDefault();
      if (realityPhase !== 'cosmic' && realityPhase !== 'alternate') {
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        if (touchPointers.has(event.pointerId)) {
          touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }
        lastPinchDistance = 0;
        return;
      }

      if (event.pointerType === 'touch') {
        const previousPoint = touchPointers.get(event.pointerId);
        if (!previousPoint) return;
        touchPointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        if (touchPointers.size >= 2) {
          const points = [...touchPointers.values()];
          const pinchDistance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
          if (lastPinchDistance > 0 && pinchDistance > 0) {
            const pinchRatio = THREE.MathUtils.clamp(
              pinchDistance / lastPinchDistance,
              0.85,
              1.15,
            );
            const travelScale = Math.pow(pinchRatio, 1.15);
            if (Math.abs(pinchRatio - 1) > 0.001) {
              playGesture(pinchRatio > 1 ? MUSIC_LAYERS.dub : MUSIC_LAYERS.clap);
            }
            if (realityPhase === 'alternate') {
              targetAlternateDistance /= travelScale;
            } else if (realityPhase === 'cosmic') {
              targetRadius /= travelScale;
            }
          }
          lastPinchDistance = pinchDistance;
          markInteraction();
          return;
        }

        const dx = event.clientX - previousPoint.x;
        const dy = event.clientY - previousPoint.y;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        if (dx !== 0 || dy !== 0) markInteraction();
        playOrbitGesture(dx, dy);
        targetAzimuth -= dx * 0.004;
        targetElevation -= dy * 0.004;
        return;
      }

      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (dx !== 0 || dy !== 0) markInteraction();
      playOrbitGesture(dx, dy);
      targetAzimuth -= dx * MOUSE_DRAG_SENSITIVITY;
      targetElevation -= dy * MOUSE_DRAG_SENSITIVITY;
    };

    const onCanvasPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touchPointers.delete(event.pointerId);
        lastPinchDistance = 0;
        const remainingPoint = touchPointers.values().next().value;
        if (remainingPoint) {
          lastPointerX = remainingPoint.x;
          lastPointerY = remainingPoint.y;
        }
        dragging = touchPointers.size > 0;
      } else {
        dragging = false;
      }
      gestureMask = 0;
      gestureUntil = 0;
      syncMovement();
      try {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The browser may have already released the pointer.
      }
      markInteraction();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (realityPhase === 'guide') {
        if (target?.closest('.qua-music-dock') || target?.matches('input, textarea, select')) return;
        const key = event.key.toLowerCase();
        if (['a', 'd', 'arrowleft', 'arrowright'].includes(key)) {
          event.preventDefault();
          keys.add(key);
        }
        return;
      }
      if (realityPhase !== 'cosmic' && realityPhase !== 'alternate') return;
      if (target?.matches('button, input, textarea, select')) return;
      const key = event.key.toLowerCase();
      // A held key from the previous realm must be released before it can
      // move the next one. Fresh presses still work normally.
      if (event.repeat && !keys.has(key)) return;
      if (document.pointerLockElement === canvas && key.startsWith('arrow')) event.preventDefault();
      keys.add(key);
      syncMovement();
      if (navigationKeys.has(key)) markInteraction();
      if (key === 'r' && (realityPhase === 'cosmic' || realityPhase === 'alternate')) {
        if (realityPhase === 'alternate') {
          applyAlternateEntryPose();
        } else {
          targetAzimuth = initialAzimuth;
          targetElevation = initialElevation;
          targetRadius = initialRadius;
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.delete(key);
      syncMovement();
      if (navigationKeys.has(key)) markInteraction();
      if (key === 'w') suppressZoomUntilKeyUp = false;
    };
    const onCosmicWheel = (event: WheelEvent) => {
      if (realityPhase !== 'cosmic' && realityPhase !== 'alternate') return;
      event.preventDefault();
      markInteraction();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const travel = THREE.MathUtils.clamp(event.deltaY * units * 0.0018, -0.42, 0.42);
      if (realityPhase === 'cosmic') targetRadius *= Math.exp(travel);
      else targetAlternateDistance *= Math.exp(travel);
      playGesture(travel > 0 ? MUSIC_LAYERS.clap : MUSIC_LAYERS.dub);
    };
    const onBlur = () => {
      guideSteerRef.current = 0;
      guideDragRef.current = null;
      keys.clear();
      touchPointers.clear();
      lastPinchDistance = 0;
      dragging = false;
      gestureMask = 0;
      gestureUntil = 0;
      syncMovement();
      suppressZoomUntilKeyUp = false;
    };

    guideChoiceRef.current = (choice) => {
      if (realityPhase !== 'guide') return;
      onBlur();
      ascensionTime = 0;
      guideTurnRef.current = 0;
      guideSteerRef.current = 0;
      uniforms.uAscension.value = 0;
      uniforms.uCloudRealm.value = 0;
      radius = targetRadius = initialRadius;
      idleViewBlend = 0;
      idleZoomPhase = 0;
      wasCosmicIdle = false;
      if (choice === 1) {
        realityPhase = 'alternate';
        realityMix = 1;
        applyAlternateEntryPose();
        setAlternateRealityActive(true);
      } else {
        realityPhase = 'cosmic';
        realityMix = 0;
        azimuth = targetAzimuth = initialAzimuth;
        elevation = targetElevation = initialElevation;
        alternateDistance = targetAlternateDistance = alternateEntryDistance;
        boxYaw = BOX_REALM_ENTRY.boxYaw;
        boxPitch = BOX_REALM_ENTRY.boxPitch;
        boxTurn.set(boxYaw, boxPitch);
        setAlternateRealityActive(false);
        updateBasis();
      }
      uniforms.uRealityMix.value = realityMix;
      setGuideStage('hidden');
      setAscensionActive(false);
      markInteraction();
      canvas.focus({ preventScroll: true });
    };
    const onResize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      const scale = coarsePointer ? 0.62 : width < 768 ? 0.72 : 0.88;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, scale));
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
      cosmicGuide.resize(width, height);
    };
    const onVisibility = () => {
      visible = !document.hidden;
      if (!visible) onBlur();
      if (visible) markInteraction();
    };

    updateBasis();
    const pointerListenerOptions: AddEventListenerOptions = { passive: false };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('pointerlockchange', onPointerLock);
    canvas.addEventListener('pointerdown', onCanvasPointerDown, pointerListenerOptions);
    canvas.addEventListener('pointermove', onCanvasPointerMove, pointerListenerOptions);
    canvas.addEventListener('pointerup', onCanvasPointerUp, pointerListenerOptions);
    canvas.addEventListener('pointercancel', onCanvasPointerUp, pointerListenerOptions);
    canvas.addEventListener('lostpointercapture', onCanvasPointerUp, pointerListenerOptions);
    canvas.addEventListener('wheel', onCosmicWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    onResize();

    const render = (now: number) => {
      frame = window.requestAnimationFrame(render);
      const delta = Math.min((now - lastFrameTime) / 1000, 0.04);
      lastFrameTime = now;
      if (!visible) return;
      syncMovement();

      const navigationActive = keys.has('a') || keys.has('d') || keys.has('w') || keys.has('s')
        || keys.has('q') || keys.has('e') || keys.has('arrowleft') || keys.has('arrowright')
        || keys.has('arrowup') || keys.has('arrowdown') || keys.has('r');
      const stableReality = realityPhase === 'cosmic' || realityPhase === 'alternate';
      if (realityPhase === 'guide') {
        const left = keys.has('a') || keys.has('arrowleft');
        const right = keys.has('d') || keys.has('arrowright');
        guideTurnRef.current += ((Number(right) - Number(left)) + guideSteerRef.current) * delta * 1.1;
      }
      const idle = stableReality && !reducedMotion && !dragging && !navigationActive && now - lastInteractionTime > 1200;
      const idleViewEase = 1.0 - Math.exp(-2.4 * delta);
      idleViewBlend += ((idle ? 1 : 0) - idleViewBlend) * idleViewEase;
      if (idle) {
        idleBeatPhase = (
          idleBeatPhase
          + delta * (idleCameraBpm / 60) * Math.PI * 2 * uniforms.uMotion.value
        ) % (Math.PI * 2);
      }
      if (idle) {
        const idleCadence = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(idleBeatPhase));
        const idleOrbitStep = delta * (idleCameraBpm / 60) * 0.024
          * idleFlowSpeed * idleCadence * idleViewBlend * uniforms.uMotion.value;
        targetAzimuth += idleOrbitStep;
      }

      const cosmicIdle = idle && realityPhase === 'cosmic' && targetRadius <= COSMIC_DETAIL_RADIUS;
      if (cosmicIdle && !wasCosmicIdle) {
        const logNear = Math.log(idleNearRadius);
        const logFar = Math.log(idleFarRadius);
        const currentZoomProgress = THREE.MathUtils.clamp(
          (Math.log(targetRadius) - logNear) / (logFar - logNear),
          0,
          1,
        );
        const phaseAtRadius = Math.acos(1 - currentZoomProgress * 2);
        idleZoomPhase = idleZoomPhase <= Math.PI
          ? phaseAtRadius
          : Math.PI * 2 - phaseAtRadius;
      }
      if (cosmicIdle) {
        idleZoomPhase = (
          idleZoomPhase
          + delta * Math.PI / idleZoomOneWaySeconds
            * idleFlowSpeed * uniforms.uMotion.value
        ) % (Math.PI * 2);
        const zoomBreath = 0.5 - 0.5 * Math.cos(idleZoomPhase);
        targetRadius = Math.exp(THREE.MathUtils.lerp(
          Math.log(idleNearRadius),
          Math.log(idleFarRadius),
          zoomBreath,
        ));
      }
      wasCosmicIdle = cosmicIdle;
      const cosmicBpm = idle ? idleBpm : activeBpm;
      const audioBeat = audioEngineRef.current?.getBeat() ?? null;
      uniforms.uMusicBeat.value = reducedMotion ? 0
        : audioBeat ?? uniforms.uMusicBeat.value + delta * (MUSIC_BPM / 60);
      if (audioBeat !== null && uniforms.uMotion.value > 0) {
        if (audioBeatOffset === null) {
          audioBeatOffset = uniforms.uCosmicBeat.value - audioBeat;
        }
        uniforms.uCosmicBeat.value = audioBeat + audioBeatOffset;
      } else {
        audioBeatOffset = null;
        uniforms.uCosmicBeat.value += delta * (cosmicBpm / 60) * uniforms.uMotion.value;
      }
      uniforms.uAltBeat.value += delta * (MUSIC_BPM / 120) * uniforms.uMotion.value;

      const boost = keys.has('shift') ? 2.15 : 1;
      if (stableReality) {
        if (keys.has('a') || keys.has('arrowleft')) targetAzimuth -= delta * 0.74 * boost;
        if (keys.has('d') || keys.has('arrowright')) targetAzimuth += delta * 0.74 * boost;
        if (keys.has('q') || keys.has('arrowdown')) targetElevation -= delta * 0.62 * boost;
        if (keys.has('e') || keys.has('arrowup')) targetElevation += delta * 0.62 * boost;
      }

      const zoomIn = keys.has('w') && !keys.has('s') && !suppressZoomUntilKeyUp;
      const zoomOut = keys.has('s') && !keys.has('w');
      if (realityPhase === 'cosmic') {
        if (zoomIn) targetRadius *= Math.exp(-delta * 0.5 * boost);
        if (zoomOut) targetRadius *= Math.exp(delta * 0.5 * boost);
      } else if (realityPhase === 'alternate') {
        if (zoomIn) targetAlternateDistance *= Math.exp(-delta * 0.52 * boost);
        if (zoomOut) targetAlternateDistance *= Math.exp(delta * 0.52 * boost);
      }

      targetRadius = THREE.MathUtils.clamp(targetRadius, cosmicMinRadius, cosmicMaxRadius);
      targetAlternateDistance = THREE.MathUtils.clamp(targetAlternateDistance, alternateCrossDistance, alternateMaxDistance);
      targetAzimuth = Math.atan2(Math.sin(targetAzimuth), Math.cos(targetAzimuth));
      targetElevation = Math.atan2(Math.sin(targetElevation), Math.cos(targetElevation));

      const orbitEase = 1.0 - Math.exp(-6.4 * delta);
      const zoomEase = 1.0 - Math.exp(-5.0 * delta);
      const previousAzimuth = azimuth;
      const previousElevation = elevation;
      const previousAlternateDistance = alternateDistance;
      const angleDelta = Math.atan2(Math.sin(targetAzimuth - azimuth), Math.cos(targetAzimuth - azimuth));
      const elevationDelta = Math.atan2(
        Math.sin(targetElevation - elevation),
        Math.cos(targetElevation - elevation),
      );
      azimuth += angleDelta * orbitEase;
      elevation += elevationDelta * orbitEase;
      azimuth = Math.atan2(Math.sin(azimuth), Math.cos(azimuth));
      elevation = Math.atan2(Math.sin(elevation), Math.cos(elevation));
      if (radius > COSMIC_DETAIL_RADIUS || targetRadius > COSMIC_DETAIL_RADIUS) {
        radius = Math.exp(THREE.MathUtils.lerp(Math.log(radius), Math.log(targetRadius), zoomEase));
      } else {
        radius += (targetRadius - radius) * zoomEase;
      }
      if (alternateDistance > alternateEntryDistance || targetAlternateDistance > alternateEntryDistance) {
        alternateDistance = Math.exp(THREE.MathUtils.lerp(
          Math.log(alternateDistance), Math.log(targetAlternateDistance), zoomEase,
        ));
      } else {
        alternateDistance += (targetAlternateDistance - alternateDistance) * zoomEase;
      }

      if (realityPhase === 'alternate') {
        const signedYaw = Math.atan2(
          Math.sin(azimuth - previousAzimuth),
          Math.cos(azimuth - previousAzimuth),
        );
        const signedPitch = Math.atan2(
          Math.sin(elevation - previousElevation),
          Math.cos(elevation - previousElevation),
        );
        const signedTravel = Math.min(previousAlternateDistance, alternateEntryDistance)
          - Math.min(alternateDistance, alternateEntryDistance);
        const roomMotion = uniforms.uMotion.value;
        boxYaw += signedYaw * 0.96 + signedTravel * 0.11 + delta * 0.16 * roomMotion;
        boxPitch += signedPitch * 0.84 + signedTravel * 0.045 + delta * 0.09 * roomMotion;
        // Twenty inner turns equal exactly twenty-seven outer turns, so
        // periodic reduction cannot snap either counter-rotating box.
        boxYaw %= Math.PI * 40;
        boxPitch %= Math.PI * 40;
        boxTurn.set(boxYaw, boxPitch);
      }
      updateBasis();

      if (realityPhase === 'cosmic' && uniforms.uMacroZoom.value >= ASCENSION_START) {
        realityPhase = 'collapsing';
        radius = targetRadius = COSMIC_DETAIL_RADIUS * MATRIX_SCALE ** ASCENSION_START;
        targetAzimuth = azimuth;
        targetElevation = elevation;
        onBlur();
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        setActive(false);
        setAscensionActive(true);
        updateBasis();
      }

      if (realityPhase === 'collapsing') {
        // Accumulated visible time pauses naturally in background tabs.
        ascensionTime = Math.min(ASCENSION_DURATION, ascensionTime + delta);
        uniforms.uAscension.value = ascensionTime;
        if (ascensionTime >= ASCENSION_DURATION) {
          realityPhase = 'guide';
          uniforms.uCloudRealm.value = 1;
          setGuideStage('arrival');
        }
      }

      if (realityPhase === 'cosmic'
        && targetRadius <= cosmicMinRadius + 0.001
        && radius <= cosmicMinRadius + 0.025) {
        realityPhase = 'entering';
        entryResetApplied = false;
        suppressZoomUntilKeyUp = true;
        setAlternateRealityActive(true);
        markInteraction();
      }

      if (realityPhase === 'alternate'
        && targetAlternateDistance <= alternateCrossDistance + 0.001
        && alternateDistance <= alternateCrossDistance + 0.018) {
        realityPhase = 'returning';
        suppressZoomUntilKeyUp = true;
        exitResetApplied = false;
        destinationRequested = false;
        markInteraction();
      }

      if (realityPhase === 'entering') {
        realityMix = Math.min(1, realityMix + delta / 0.86);
        if (!entryResetApplied && realityMix >= 0.5) {
          applyAlternateEntryPose();
          entryResetApplied = true;
        }
        if (realityMix >= 1) {
          realityPhase = 'alternate';
          markInteraction();
        }
      } else if (realityPhase === 'returning') {
        realityMix = destinationRequested
          ? 0.5
          : Math.max(0, realityMix - delta / 0.86);
        if (!exitResetApplied && realityMix <= 0.5) {
          exitResetApplied = true;
          destinationRequested = true;
          audioWantedRef.current = false;
          audioEngineRef.current?.setMuted(true);
          setSoundOn(false);
          // The portal flash holds at full intensity while the original QUA
          // experience replaces this WebGL world in the same mobile-safe tab.
          window.location.assign(ORIGINAL_QUA_SITE_URL);
        }
        if (realityMix <= 0) {
          realityPhase = 'cosmic';
          azimuth = targetAzimuth = initialAzimuth;
          elevation = targetElevation = initialElevation;
          radius = targetRadius = initialRadius;
          alternateDistance = targetAlternateDistance = alternateEntryDistance;
          boxYaw = BOX_REALM_ENTRY.boxYaw;
          boxPitch = BOX_REALM_ENTRY.boxPitch;
          boxTurn.set(boxYaw, boxPitch);
          idleViewBlend = 0;
          idleZoomPhase = 0;
          wasCosmicIdle = false;
          setAlternateRealityActive(false);
          updateBasis();
          markInteraction();
        }
      }

      uniforms.uRealityMix.value = realityMix;
      uniforms.uAltDistance.value = alternateDistance;
      renderer.render(scene, camera);
      if (realityPhase === 'guide' || (realityPhase === 'collapsing' && ascensionTime > 5.4)) {
        const opacity = THREE.MathUtils.smoothstep(ascensionTime, 5.4, ASCENSION_DURATION);
        cosmicGuide.update(uniforms.uAltBeat.value, opacity, reducedMotion, guideTurnRef.current);
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(cosmicGuide.scene, cosmicGuide.camera);
        renderer.autoClear = true;
      }
    };

    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('pointerlockchange', onPointerLock);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown, pointerListenerOptions);
      canvas.removeEventListener('pointermove', onCanvasPointerMove, pointerListenerOptions);
      canvas.removeEventListener('pointerup', onCanvasPointerUp, pointerListenerOptions);
      canvas.removeEventListener('pointercancel', onCanvasPointerUp, pointerListenerOptions);
      canvas.removeEventListener('lostpointercapture', onCanvasPointerUp, pointerListenerOptions);
      canvas.removeEventListener('wheel', onCosmicWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      guideChoiceRef.current = null;
      guideSteerRef.current = 0;
      cosmicGuide.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
    };
  }, []);

  const enter = () => {
    if (ascensionActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!finePointer || typeof canvas.requestPointerLock !== 'function') {
      setActive(true);
      return;
    }

    try {
      const request = canvas.requestPointerLock();
      request?.catch(() => setActive(false));
    } catch {
      setActive(false);
    }
  };

  return (
    <main className={`experience-shell${ascensionActive ? ' experience-shell--cloud' : ''}`}>
      <canvas
        ref={canvasRef}
        className="space-canvas"
        tabIndex={ascensionActive ? -1 : 0}
        aria-label={ascensionActive ? 'A white cloud realm with a rainbow-chrome golden pyramid guide and your luminous chakra light body' : alternateRealityActive
          ? 'Interactive chrome portal realm floating above an ocean with a solid-black sphere'
          : 'Interactive three-dimensional view of a black hole and accretion disk'}
        aria-describedby={ascensionActive ? undefined : 'controls'}
        aria-hidden={guideStage !== 'hidden'}
        style={ascensionActive ? { pointerEvents: 'none' } : undefined}
        onPointerDown={unlockAudio}
        onClick={enter}
      />

      {!supported && <div className="fallback" role="alert">This browser cannot render the live space.</div>}

      <div ref={musicDockRef} className="qua-music-dock">
        {musicMenuOpen && (
          <div id="qua-music-menu" className="qua-music-menu" role="group" aria-label="Music playback">
            <span>QUA · SOUND</span>
            <div>
              <button type="button" aria-pressed={soundOn} onClick={() => startAudio()}>Play</button>
              <button type="button" aria-pressed={!soundOn} onClick={() => {
                audioWantedRef.current = false;
                audioEngineRef.current?.setMuted(true);
                setSoundOn(false);
              }}>Pause</button>
            </div>
            <small>{soundOn ? 'In joy, play.' : 'A moment of stillness.'}</small>
          </div>
        )}
        <button
          type="button"
          className="qua-music-button"
          aria-label="QUA music controls"
          aria-expanded={musicMenuOpen}
          aria-controls="qua-music-menu"
          title="QUA · Music controls"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            setMusicMenuOpen(!musicMenuOpen);
          }}
        ><QuaOrb active={false} /></button>
      </div>

      {!ascensionActive && <div className="hud-stack">
        <aside id="controls" className={`controls ${active ? 'controls--active' : ''}`} aria-label="Experience controls">
          <div className="controls-heading">
            <span className="status-dot" />
            <span className="controls-heading__label">
              <span className="controls-heading__desktop">
                {alternateRealityActive ? 'PORTAL REALM ACTIVE' : active ? 'ORBIT ACTIVE' : 'CLICK SPACE TO ENTER'}
              </span>
              <span className="controls-heading__touch">
                {alternateRealityActive ? 'PORTAL REALM ACTIVE' : active ? 'TOUCH ORBIT ACTIVE' : 'TOUCH SPACE TO ENTER'}
              </span>
            </span>
            <button
              type="button"
              className={`sound-toggle ${soundOn ? 'sound-toggle--on' : ''}`}
              aria-label={soundOn ? 'Mute ambient dub techno' : 'Play ambient dub techno'}
              aria-pressed={soundOn}
              title={soundOn ? 'Mute ambient dub' : 'Play ambient dub'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                toggleAudio();
              }}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          {alternateRealityActive ? (
            <>
              <dl className="desktop-controls">
                <div><dt>Orbit</dt><dd>Mouse <span>/</span> <kbd>&#8593;&#8595;&#8592;&#8594;</kbd></dd></div>
                <div><dt>Enter sphere</dt><dd><kbd>W</kbd></dd></div>
                <div><dt>Retreat to ocean</dt><dd><kbd>S</kbd></dd></div>
                <div><dt>Recenter</dt><dd><kbd>R</kbd></dd></div>
                <div><dt>Release</dt><dd><kbd>ESC</kbd></dd></div>
              </dl>
              <dl className="touch-controls">
                <div><dt>Orbit</dt><dd>One-finger drag</dd></div>
                <div><dt>Enter sphere</dt><dd>Pinch outward</dd></div>
                <div><dt>Retreat to ocean</dt><dd>Pinch inward</dd></div>
              </dl>
            </>
          ) : (
            <>
              <dl className="desktop-controls">
                <div><dt>Orbit</dt><dd>Mouse <span>/</span> <kbd>&#8593;&#8595;&#8592;&#8594;</kbd></dd></div>
                <div><dt>Approach / retreat</dt><dd><kbd>W</kbd><span>/</span><kbd>S</kbd></dd></div>
                <div><dt>Below / above</dt><dd><kbd>Q</kbd><span>/</span><kbd>E</kbd></dd></div>
                <div><dt>Recenter</dt><dd><kbd>R</kbd></dd></div>
                <div><dt>Release</dt><dd><kbd>ESC</kbd></dd></div>
              </dl>
              <dl className="touch-controls">
                <div><dt>Orbit</dt><dd>One-finger drag</dd></div>
                <div><dt>Approach</dt><dd>Pinch outward</dd></div>
                <div><dt>Retreat</dt><dd>Pinch inward</dd></div>
              </dl>
            </>
          )}
          <div className="track-picker" role="group" aria-label={`Choose a ${MUSIC_BPM} BPM base track`}>
            <div className="track-picker__label">BASE TRACK <span>{MUSIC_BPM} BPM</span></div>
            <div className="track-picker__options">
              {BASE_TRACKS.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  aria-pressed={baseTrack === track.id}
                  title={`${track.description}. Changes on the next bar.`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    chooseTrack(track.id);
                  }}
                >{track.label}</button>
              ))}
            </div>
          </div>
          <p className="music-guide">Left · hats / Right · shaker<br />Up · pad / Down · pulse<br />Approach · dub / Retreat · clap on 2 &amp; 4</p>
          <p className="music-guide music-guide--quiet">Hold to loop. Release · rides for 8 seconds.</p>
        </aside>
      </div>}

      {guideStage !== 'hidden' && (
        <div
          className="guide-gesture-surface"
          aria-hidden="true"
          onPointerDown={(event) => {
            guideDragRef.current = { id: event.pointerId, x: event.clientX };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = guideDragRef.current;
            if (!drag || drag.id !== event.pointerId) return;
            guideTurnRef.current += (event.clientX - drag.x) * 0.012;
            drag.x = event.clientX;
          }}
          onPointerUp={() => { guideDragRef.current = null; }}
          onPointerCancel={() => { guideDragRef.current = null; }}
        />
      )}
      {guideStage !== 'hidden' && (
        <section
          ref={guidePanelRef}
          className="cosmic-dialogue"
          role="dialog"
          aria-modal="false"
          aria-labelledby="guide-title"
          aria-describedby="guide-speech"
        >
          <span className="cosmic-dialogue__eyebrow">{GUIDE_DIALOGUE[guideStage].eyebrow}</span>
          <h1 id="guide-title">{GUIDE_DIALOGUE[guideStage].title}</h1>
          <p id="guide-speech" aria-live="polite">{GUIDE_DIALOGUE[guideStage].text}</p>
          {guideStage === 'question' ? (
            <div className="cosmic-dialogue__choices">
              <button type="button" onClick={() => setGuideStage('zero')}>
                <strong>0</strong><span>Return to possibility<small>The black-hole beginning</small></span>
              </button>
              <button type="button" onClick={() => setGuideStage('one')}>
                <strong>1</strong><span>Step into form<small>Enter the red square</small></span>
              </button>
            </div>
          ) : (
            <button type="button" className="cosmic-dialogue__continue" onClick={advanceGuide}>
              {GUIDE_DIALOGUE[guideStage].action}<span aria-hidden="true">↗</span>
            </button>
          )}
          <div className="guide-steering" aria-label="Turn your light body">
            <button type="button" aria-label="Twirl chakras left"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); guideSteerRef.current = -1; }}
              onPointerUp={() => { guideSteerRef.current = 0; }}
              onPointerCancel={() => { guideSteerRef.current = 0; }}
              onLostPointerCapture={() => { guideSteerRef.current = 0; }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') guideSteerRef.current = -1; }}
              onKeyUp={() => { guideSteerRef.current = 0; }}
              onBlur={() => { guideSteerRef.current = 0; }}
            >←</button>
            <span>Drag or use ← → to turn your light</span>
            <button type="button" aria-label="Twirl chakras right"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); guideSteerRef.current = 1; }}
              onPointerUp={() => { guideSteerRef.current = 0; }}
              onPointerCancel={() => { guideSteerRef.current = 0; }}
              onLostPointerCapture={() => { guideSteerRef.current = 0; }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') guideSteerRef.current = 1; }}
              onKeyUp={() => { guideSteerRef.current = 0; }}
              onBlur={() => { guideSteerRef.current = 0; }}
            >→</button>
          </div>
        </section>
      )}

      <p className="sr-only" aria-live="polite">
        {ascensionActive
          ? 'Beyond the last star. Meet the golden guide and choose a path.'
          : alternateRealityActive
          ? 'Portal realm active. Move forward through the solid-black sphere to continue into the original QUA experience.'
          : active ? 'Immersive controls active. Press Escape to release the cursor.' : 'Immersive controls inactive.'}
      </p>
    </main>
  );
}

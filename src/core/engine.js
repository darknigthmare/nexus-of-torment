(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const M = NT.Math;
  const {
    Vec3, clamp, randRange, mat4, mat4Multiply, mat4Perspective, mat4LookAt,
    mat4FromTransform, mat3NormalFromMat4, cameraBasis, colorHex
  } = M;

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Erreur de compilation shader';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Erreur de liaison shader';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  class Transform {
    constructor(position = new Vec3(), rotation = new Vec3(), scale = new Vec3(1, 1, 1)) {
      this.position = position;
      this.rotation = rotation;
      this.scale = scale;
      this.matrix = mat4();
    }
    updateMatrix() { mat4FromTransform(this.matrix, this.position, this.rotation, this.scale); return this.matrix; }
    set(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      this.position.set(x, y, z); this.rotation.set(rx, ry, rz); this.scale.set(sx, sy, sz); return this;
    }
  }

  class Material {
    constructor(options = {}) {
      this.color = options.color instanceof Float32Array ? options.color : colorHex(options.color ?? 0xffffff);
      this.emissive = options.emissive instanceof Float32Array ? options.emissive : colorHex(options.emissive ?? 0x000000).subarray(0, 3);
      this.pattern = options.pattern ?? 0;
      this.metallic = options.metallic ?? 0.25;
      this.alpha = options.alpha ?? this.color[3] ?? 1;
      this.doubleSided = Boolean(options.doubleSided);
      this.additive = Boolean(options.additive);
      this.depthWrite = options.depthWrite !== false;
      this.pulse = options.pulse ?? 0;
    }
    clone(overrides = {}) {
      return new Material({
        color: overrides.color ?? new Float32Array(this.color),
        emissive: overrides.emissive ?? new Float32Array(this.emissive),
        pattern: overrides.pattern ?? this.pattern,
        metallic: overrides.metallic ?? this.metallic,
        alpha: overrides.alpha ?? this.alpha,
        doubleSided: overrides.doubleSided ?? this.doubleSided,
        additive: overrides.additive ?? this.additive,
        depthWrite: overrides.depthWrite ?? this.depthWrite,
        pulse: overrides.pulse ?? this.pulse,
      });
    }
  }

  class Mesh {
    constructor(gl, vertices, indices, name = 'mesh') {
      this.gl = gl;
      this.name = name;
      this.count = indices.length;
      this.indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.vao = gl.createVertexArray();
      this.vbo = gl.createBuffer();
      this.ibo = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      const stride = 8 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
      gl.bindVertexArray(null);
      this.triangles = Math.floor(indices.length / 3);
    }
    dispose() {
      const gl = this.gl;
      gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.ibo); gl.deleteVertexArray(this.vao);
    }
  }

  function pushFace(vertices, indices, corners, normal) {
    const base = vertices.length / 8;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      const c = corners[i], uv = uvs[i];
      vertices.push(c[0], c[1], c[2], normal[0], normal[1], normal[2], uv[0], uv[1]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const Geometry = {
    cube() {
      const v = [], i = [];
      pushFace(v, i, [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]], [0,0,1]);
      pushFace(v, i, [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]], [0,0,-1]);
      pushFace(v, i, [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]], [-1,0,0]);
      pushFace(v, i, [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]], [1,0,0]);
      pushFace(v, i, [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]], [0,1,0]);
      pushFace(v, i, [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]], [0,-1,0]);
      return { vertices: new Float32Array(v), indices: new Uint16Array(i) };
    },
    plane() {
      const v = new Float32Array([
        -.5,0,-.5, 0,1,0, 0,0,
         .5,0,-.5, 0,1,0, 1,0,
         .5,0, .5, 0,1,0, 1,1,
        -.5,0, .5, 0,1,0, 0,1,
      ]);
      return { vertices: v, indices: new Uint16Array([0,1,2,0,2,3]) };
    },
    cylinder(segments = 10, topRadius = .5, bottomRadius = .5, cap = true) {
      const v = [], i = [];
      for (let s = 0; s <= segments; s++) {
        const a = s / segments * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const slope = bottomRadius - topRadius;
        const nx = ca, ny = slope, nz = sa;
        const nl = Math.hypot(nx, ny, nz);
        v.push(ca * bottomRadius, -.5, sa * bottomRadius, nx/nl, ny/nl, nz/nl, s/segments, 0);
        v.push(ca * topRadius, .5, sa * topRadius, nx/nl, ny/nl, nz/nl, s/segments, 1);
      }
      for (let s = 0; s < segments; s++) {
        const base = s * 2;
        i.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
      if (cap) {
        let center = v.length / 8;
        v.push(0,-.5,0, 0,-1,0, .5,.5);
        for (let s = 0; s <= segments; s++) {
          const a = s / segments * Math.PI * 2;
          v.push(Math.cos(a)*bottomRadius,-.5,Math.sin(a)*bottomRadius, 0,-1,0, (Math.cos(a)+1)/2,(Math.sin(a)+1)/2);
        }
        for (let s = 0; s < segments; s++) i.push(center, center+s+2, center+s+1);
        center = v.length / 8;
        v.push(0,.5,0, 0,1,0, .5,.5);
        for (let s = 0; s <= segments; s++) {
          const a = s / segments * Math.PI * 2;
          v.push(Math.cos(a)*topRadius,.5,Math.sin(a)*topRadius, 0,1,0, (Math.cos(a)+1)/2,(Math.sin(a)+1)/2);
        }
        for (let s = 0; s < segments; s++) i.push(center, center+s+1, center+s+2);
      }
      const Index = v.length / 8 > 65535 ? Uint32Array : Uint16Array;
      return { vertices: new Float32Array(v), indices: new Index(i) };
    },
    sphere(latitudes = 8, longitudes = 12) {
      const v = [], i = [];
      for (let lat = 0; lat <= latitudes; lat++) {
        const theta = lat / latitudes * Math.PI;
        const sy = Math.cos(theta), ring = Math.sin(theta);
        for (let lon = 0; lon <= longitudes; lon++) {
          const phi = lon / longitudes * Math.PI * 2;
          const x = ring * Math.cos(phi), z = ring * Math.sin(phi);
          v.push(x*.5, sy*.5, z*.5, x, sy, z, lon/longitudes, lat/latitudes);
        }
      }
      for (let lat = 0; lat < latitudes; lat++) {
        for (let lon = 0; lon < longitudes; lon++) {
          const a = lat * (longitudes + 1) + lon;
          const b = a + longitudes + 1;
          i.push(a,b,a+1,b,b+1,a+1);
        }
      }
      return { vertices: new Float32Array(v), indices: new Uint16Array(i) };
    },
    torus(majorSegments = 16, minorSegments = 6, majorRadius = .38, minorRadius = .12) {
      const v = [], i = [];
      for (let a = 0; a <= majorSegments; a++) {
        const u = a / majorSegments * Math.PI * 2;
        const cu = Math.cos(u), su = Math.sin(u);
        for (let b = 0; b <= minorSegments; b++) {
          const w = b / minorSegments * Math.PI * 2;
          const cw = Math.cos(w), sw = Math.sin(w);
          const r = majorRadius + minorRadius * cw;
          const x = r * cu, y = minorRadius * sw, z = r * su;
          const nx = cw * cu, ny = sw, nz = cw * su;
          v.push(x,y,z,nx,ny,nz,a/majorSegments,b/minorSegments);
        }
      }
      const row = minorSegments + 1;
      for (let a = 0; a < majorSegments; a++) {
        for (let b = 0; b < minorSegments; b++) {
          const p = a * row + b, q = (a + 1) * row + b;
          i.push(p,q,p+1,q,q+1,p+1);
        }
      }
      return { vertices: new Float32Array(v), indices: new Uint16Array(i) };
    },
    prism() {
      const v = [], i = [];
      const points = [[-.5,-.5],[.5,-.5],[0,.5]];
      for (let face = 0; face < 2; face++) {
        const z = face ? .5 : -.5, nz = face ? 1 : -1;
        const base = v.length / 8;
        for (const p of points) v.push(p[0],p[1],z,0,0,nz,p[0]+.5,p[1]+.5);
        if (face) i.push(base,base+1,base+2); else i.push(base,base+2,base+1);
      }
      for (let e = 0; e < 3; e++) {
        const a = points[e], b = points[(e+1)%3];
        const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy), nx=dy/len, ny=-dx/len;
        const base=v.length/8;
        v.push(a[0],a[1],-.5,nx,ny,0,0,0,b[0],b[1],-.5,nx,ny,0,1,0,b[0],b[1],.5,nx,ny,0,1,1,a[0],a[1],.5,nx,ny,0,0,1);
        i.push(base,base+1,base+2,base,base+2,base+3);
      }
      return { vertices:new Float32Array(v), indices:new Uint16Array(i) };
    }
  };

  const MAIN_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aNormal;
    layout(location=2) in vec2 aUv;
    uniform mat4 uViewProj;
    uniform mat4 uModel;
    uniform mat3 uNormalMatrix;
    out vec3 vWorldPosition;
    out vec3 vNormal;
    out vec2 vUv;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vWorldPosition = world.xyz;
      vNormal = normalize(uNormalMatrix * aNormal);
      vUv = aUv;
      gl_Position = uViewProj * world;
    }
  `;

  const MAIN_FRAGMENT = `#version 300 es
    precision highp float;
    in vec3 vWorldPosition;
    in vec3 vNormal;
    in vec2 vUv;
    uniform vec4 uColor;
    uniform vec3 uEmissive;
    uniform float uPattern;
    uniform float uMetallic;
    uniform float uPulse;
    uniform float uTime;
    uniform vec3 uCameraPosition;
    uniform vec3 uFogColor;
    uniform vec2 uFogRange;
    uniform vec3 uAmbient;
    uniform vec3 uLightPositions[4];
    uniform vec3 uLightColors[4];
    uniform float uLightPowers[4];
    out vec4 outColor;

    float gridPattern(vec3 p) {
      vec3 g = abs(fract(p * 0.45) - 0.5) / fwidth(p * 0.45);
      return 1.0 - min(min(g.x, g.y), g.z);
    }
    float fleshPattern(vec3 p) {
      float vein = sin(p.x * 4.7 + sin(p.z * 2.1) * 2.0 + uTime * .25);
      vein += sin(p.y * 7.1 - p.z * 3.3) * .45;
      return smoothstep(.72, 1.18, abs(vein));
    }
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
      vec3 base = uColor.rgb;
      if (uPattern > .5 && uPattern < 1.5) {
        float g = clamp(gridPattern(vWorldPosition), 0.0, 1.0);
        base *= mix(.62, 1.05, g * .34);
        base += vec3(.035) * g;
      } else if (uPattern > 1.5 && uPattern < 2.5) {
        float vein = fleshPattern(vWorldPosition);
        base = mix(base, base * vec3(.35,.12,.16), vein * .72);
      } else if (uPattern > 2.5 && uPattern < 3.5) {
        float rune = smoothstep(.78, .98, abs(sin(vWorldPosition.x * 5.0) * sin(vWorldPosition.z * 5.0)));
        base += rune * uEmissive * (.25 + .25 * sin(uTime * 2.4));
      } else if (uPattern > 3.5) {
        float band = .65 + .35 * sin((vWorldPosition.y + vWorldPosition.x) * 13.0 + uTime * 4.0);
        base *= band;
      }
      vec3 lighting = uAmbient;
      float specular = 0.0;
      for (int index = 0; index < 4; index++) {
        vec3 toLight = uLightPositions[index] - vWorldPosition;
        float distanceSq = max(dot(toLight, toLight), .03);
        vec3 lightDir = toLight * inversesqrt(distanceSq);
        float diffuse = max(dot(normal, lightDir), 0.0);
        float attenuation = uLightPowers[index] / (1.0 + distanceSq * .075);
        lighting += uLightColors[index] * diffuse * attenuation;
        vec3 halfDir = normalize(lightDir + viewDir);
        specular += pow(max(dot(normal, halfDir), 0.0), mix(8.0, 38.0, uMetallic)) * attenuation;
      }
      float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
      float pulse = 1.0 + uPulse * (.35 + .25 * sin(uTime * 3.0 + vWorldPosition.y * 2.0));
      vec3 color = base * lighting + vec3(specular) * mix(.08, .32, uMetallic) + uEmissive * pulse + base * rim * .12;
      float distanceToCamera = distance(uCameraPosition, vWorldPosition);
      float fog = smoothstep(uFogRange.x, uFogRange.y, distanceToCamera);
      color = mix(color, uFogColor, fog);
      color = color / (color + vec3(1.0));
      color = pow(color, vec3(.92));
      outColor = vec4(color, uColor.a);
    }
  `;

  const PARTICLE_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec4 aColor;
    layout(location=2) in float aSize;
    uniform mat4 uViewProj;
    uniform vec3 uCameraPosition;
    out vec4 vColor;
    void main() {
      vec4 clip = uViewProj * vec4(aPosition, 1.0);
      gl_Position = clip;
      float d = max(distance(aPosition, uCameraPosition), .25);
      gl_PointSize = clamp(aSize * 120.0 / d, 1.0, 72.0);
      vColor = aColor;
    }
  `;

  const PARTICLE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec4 vColor;
    out vec4 outColor;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float d = dot(p,p);
      if (d > 1.0) discard;
      float alpha = (1.0 - smoothstep(.18, 1.0, d)) * vColor.a;
      outColor = vec4(vColor.rgb, alpha);
    }
  `;

  class Camera {
    constructor() {
      this.position = new Vec3(0, 1.72, 8);
      this.yaw = 0;
      this.pitch = 0;
      this.fov = 82;
      this.near = .04;
      this.far = 130;
      this.forward = new Vec3(0, 0, -1);
      this.right = new Vec3(1, 0, 0);
      this.up = new Vec3(0, 1, 0);
      this.view = mat4();
      this.projection = mat4();
      this.viewProjection = mat4();
      this.target = new Vec3();
      this.shake = new Vec3();
      this.roll = 0;
    }
    update(aspect) {
      cameraBasis(this.yaw, this.pitch, this.forward, this.right, this.up);
      this.target.copy(this.position).add(this.forward);
      const eye = _cameraEye.copy(this.position).add(this.shake);
      const target = _cameraTarget.copy(eye).add(this.forward);
      mat4LookAt(this.view, eye, target, this.up);
      mat4Perspective(this.projection, this.fov * Math.PI / 180, aspect, this.near, this.far);
      mat4Multiply(this.viewProjection, this.projection, this.view);
    }
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', {
        alpha: false, antialias: true, depth: true, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false
      });
      if (!this.gl) throw new Error('WebGL2 indisponible');
      const gl = this.gl;
      this.program = createProgram(gl, MAIN_VERTEX, MAIN_FRAGMENT);
      this.particleProgram = createProgram(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
      this.uniforms = {};
      for (const name of ['uViewProj','uModel','uNormalMatrix','uColor','uEmissive','uPattern','uMetallic','uPulse','uTime','uCameraPosition','uFogColor','uFogRange','uAmbient','uLightPositions','uLightColors','uLightPowers']) {
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      }
      this.particleUniforms = {
        viewProjection: gl.getUniformLocation(this.particleProgram, 'uViewProj'),
        cameraPosition: gl.getUniformLocation(this.particleProgram, 'uCameraPosition')
      };
      this.renderScale = 1;
      this.maxPixelRatio = 1.75;
      this.clearColor = new Float32Array([.015,.01,.013,1]);
      this.fogColor = new Float32Array([.025,.012,.017]);
      this.fogRange = new Float32Array([28, 72]);
      this.ambient = new Float32Array([.095,.07,.08]);
      this.lightPositions = new Float32Array(12);
      this.lightColors = new Float32Array(12);
      this.lightPowers = new Float32Array([1,1,1,1]);
      this.normalMatrix = new Float32Array(9);
      this.currentMesh = null;
      this.drawCalls = 0;
      this.triangles = 0;
      this.time = 0;
      this.camera = null;
      this._initState();
      this.meshes = this._createMeshes();
      this.defaultMaterial = new Material({ color: 0xffffff });
    }
    _initState() {
      const gl = this.gl;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearDepth(1);
    }
    _createMeshes() {
      const gl = this.gl;
      const build = (data, name) => new Mesh(gl, data.vertices, data.indices, name);
      return {
        cube: build(Geometry.cube(), 'cube'),
        plane: build(Geometry.plane(), 'plane'),
        cylinder6: build(Geometry.cylinder(6), 'cylinder6'),
        cylinder8: build(Geometry.cylinder(8), 'cylinder8'),
        cylinder12: build(Geometry.cylinder(12), 'cylinder12'),
        cone6: build(Geometry.cylinder(6, 0, .5), 'cone6'),
        cone8: build(Geometry.cylinder(8, 0, .5), 'cone8'),
        sphere6: build(Geometry.sphere(5, 7), 'sphere6'),
        sphere8: build(Geometry.sphere(7, 10), 'sphere8'),
        sphere12: build(Geometry.sphere(10, 16), 'sphere12'),
        torus: build(Geometry.torus(18, 7), 'torus'),
        torusLow: build(Geometry.torus(12, 5), 'torusLow'),
        prism: build(Geometry.prism(), 'prism')
      };
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.renderScale;
      const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width; this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      return width / height;
    }
    begin(camera, time) {
      const gl = this.gl;
      this.time = time;
      this.camera = camera;
      const aspect = this.resize();
      camera.update(aspect);
      gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.uniforms.uViewProj, false, camera.viewProjection);
      gl.uniform1f(this.uniforms.uTime, time);
      gl.uniform3f(this.uniforms.uCameraPosition, camera.position.x, camera.position.y, camera.position.z);
      gl.uniform3fv(this.uniforms.uFogColor, this.fogColor);
      gl.uniform2fv(this.uniforms.uFogRange, this.fogRange);
      gl.uniform3fv(this.uniforms.uAmbient, this.ambient);
      gl.uniform3fv(this.uniforms.uLightPositions, this.lightPositions);
      gl.uniform3fv(this.uniforms.uLightColors, this.lightColors);
      gl.uniform1fv(this.uniforms.uLightPowers, this.lightPowers);
      this.currentMesh = null;
      this.drawCalls = 0;
      this.triangles = 0;
    }
    setLight(index, position, color, power) {
      const offset = index * 3;
      this.lightPositions[offset] = position.x;
      this.lightPositions[offset + 1] = position.y;
      this.lightPositions[offset + 2] = position.z;
      if (color instanceof Float32Array || Array.isArray(color)) {
        this.lightColors[offset] = color[0]; this.lightColors[offset+1] = color[1]; this.lightColors[offset+2] = color[2];
      } else {
        const c = colorHex(color);
        this.lightColors[offset] = c[0]; this.lightColors[offset+1] = c[1]; this.lightColors[offset+2] = c[2];
      }
      this.lightPowers[index] = power;
    }
    setAtmosphere({ clearColor, fogColor, fogNear, fogFar, ambient } = {}) {
      if (clearColor) this.clearColor.set(clearColor.length > 4 ? clearColor.subarray(0,4) : clearColor);
      if (fogColor) this.fogColor.set(fogColor.length > 3 ? fogColor.subarray(0,3) : fogColor);
      if (fogNear !== undefined) this.fogRange[0] = fogNear;
      if (fogFar !== undefined) this.fogRange[1] = fogFar;
      if (ambient) this.ambient.set(ambient.length > 3 ? ambient.subarray(0,3) : ambient);
    }
    draw(mesh, modelMatrix, material = this.defaultMaterial) {
      const gl = this.gl;
      if (this.currentMesh !== mesh) {
        gl.bindVertexArray(mesh.vao);
        this.currentMesh = mesh;
      }
      if (material.doubleSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      const transparent = material.alpha < .995 || material.additive;
      gl.depthMask(material.depthWrite && !transparent);
      gl.blendFunc(material.additive ? gl.SRC_ALPHA : gl.SRC_ALPHA, material.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      mat3NormalFromMat4(this.normalMatrix, modelMatrix);
      gl.uniformMatrix4fv(this.uniforms.uModel, false, modelMatrix);
      gl.uniformMatrix3fv(this.uniforms.uNormalMatrix, false, this.normalMatrix);
      gl.uniform4f(this.uniforms.uColor, material.color[0], material.color[1], material.color[2], material.alpha);
      gl.uniform3fv(this.uniforms.uEmissive, material.emissive);
      gl.uniform1f(this.uniforms.uPattern, material.pattern);
      gl.uniform1f(this.uniforms.uMetallic, material.metallic);
      gl.uniform1f(this.uniforms.uPulse, material.pulse);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
      this.drawCalls++;
      this.triangles += mesh.triangles;
      if (transparent) {
        gl.depthMask(true);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
    }
    drawTransform(mesh, transform, material) { this.draw(mesh, transform.updateMatrix(), material); }
    clearDepth() { this.gl.clear(this.gl.DEPTH_BUFFER_BIT); }
    beginParticlePass() {
      const gl = this.gl;
      gl.useProgram(this.particleProgram);
      gl.uniformMatrix4fv(this.particleUniforms.viewProjection, false, this.camera.viewProjection);
      gl.uniform3f(this.particleUniforms.cameraPosition, this.camera.position.x, this.camera.position.y, this.camera.position.z);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    }
    endParticlePass() {
      const gl = this.gl;
      gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.CULL_FACE);
      gl.useProgram(this.program);
      this.currentMesh = null;
    }
  }

  function modelMatrixBetween(out, a, b, radius = .05) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const length = Math.hypot(ux, uy, uz) || .0001;
    const yx = ux / length, yy = uy / length, yz = uz / length;
    let refx = 0, refy = Math.abs(yy) > .96 ? 0 : 1, refz = Math.abs(yy) > .96 ? 1 : 0;
    let xx = refy * yz - refz * yy;
    let xy = refz * yx - refx * yz;
    let xz = refx * yy - refy * yx;
    const xl = Math.hypot(xx,xy,xz) || 1;
    xx/=xl; xy/=xl; xz/=xl;
    const zx = yy*xz - yz*xy;
    const zy = yz*xx - yx*xz;
    const zz = yx*xy - yy*xx;
    out[0]=xx*radius; out[1]=xy*radius; out[2]=xz*radius; out[3]=0;
    out[4]=yx*length; out[5]=yy*length; out[6]=yz*length; out[7]=0;
    out[8]=zx*radius; out[9]=zy*radius; out[10]=zz*radius; out[11]=0;
    out[12]=(a.x+b.x)*.5; out[13]=(a.y+b.y)*.5; out[14]=(a.z+b.z)*.5; out[15]=1;
    return out;
  }

  class ParticleSystem {
    constructor(renderer, maxParticles = 1800) {
      this.renderer = renderer;
      this.gl = renderer.gl;
      this.maxParticles = maxParticles;
      this.particles = [];
      this.data = new Float32Array(maxParticles * 8);
      const gl = this.gl;
      this.vao = gl.createVertexArray();
      this.buffer = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      const stride = 8 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,4,gl.FLOAT,false,stride,3*4);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,1,gl.FLOAT,false,stride,7*4);
      gl.bindVertexArray(null);
    }
    spawn(options) {
      if (this.particles.length >= this.maxParticles) this.particles.shift();
      const color = options.color instanceof Float32Array ? options.color : colorHex(options.color ?? 0xffffff);
      this.particles.push({
        position: (options.position || new Vec3()).clone(),
        velocity: (options.velocity || new Vec3()).clone(),
        color: new Float32Array([color[0],color[1],color[2],options.alpha ?? 1]),
        size: options.size ?? .14,
        life: options.life ?? .6,
        maxLife: options.life ?? .6,
        gravity: options.gravity ?? 0,
        drag: options.drag ?? 0,
        fade: options.fade !== false,
        shrink: options.shrink ?? .25,
        floorBounce: options.floorBounce ?? 0,
        emissive: options.emissive !== false
      });
    }
    burst(position, options = {}) {
      const count = options.count ?? 12;
      for (let index = 0; index < count; index++) {
        const speed = randRange(options.speedMin ?? .8, options.speedMax ?? 4.5);
        const theta = Math.random() * Math.PI * 2;
        const y = randRange(options.verticalMin ?? -.1, options.verticalMax ?? 1);
        const flat = Math.sqrt(Math.max(0, 1 - y*y));
        const velocity = new Vec3(Math.cos(theta)*flat*speed, y*speed, Math.sin(theta)*flat*speed);
        if (options.direction) velocity.addScaled(options.direction, options.directional ?? 1.5);
        this.spawn({
          position, velocity, color: options.color ?? 0xd14c48,
          size: randRange(options.sizeMin ?? .06, options.sizeMax ?? .18),
          life: randRange(options.lifeMin ?? .3, options.lifeMax ?? .85),
          gravity: options.gravity ?? 7, drag: options.drag ?? 1.2,
          alpha: options.alpha ?? 1, floorBounce: options.floorBounce ?? .2,
          shrink: options.shrink ?? .25
        });
      }
    }
    update(dt) {
      for (let index = this.particles.length - 1; index >= 0; index--) {
        const p = this.particles[index];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(index,1); continue; }
        p.velocity.y -= p.gravity * dt;
        const damping = Math.exp(-p.drag * dt);
        p.velocity.scale(damping);
        p.position.addScaled(p.velocity, dt);
        if (p.position.y < .015 && p.floorBounce > 0) {
          p.position.y = .015;
          if (p.velocity.y < 0) p.velocity.y = -p.velocity.y * p.floorBounce;
          p.velocity.x *= .72; p.velocity.z *= .72;
        }
      }
    }
    draw() {
      const count = Math.min(this.particles.length, this.maxParticles);
      if (!count) return;
      for (let index = 0; index < count; index++) {
        const p = this.particles[index], offset = index * 8;
        const t = clamp(p.life / p.maxLife, 0, 1);
        this.data[offset] = p.position.x; this.data[offset+1] = p.position.y; this.data[offset+2] = p.position.z;
        this.data[offset+3] = p.color[0]; this.data[offset+4] = p.color[1]; this.data[offset+5] = p.color[2];
        this.data[offset+6] = p.fade ? p.color[3] * Math.min(1, t * 2) : p.color[3];
        this.data[offset+7] = p.size * (p.shrink + (1-p.shrink)*t);
      }
      const gl = this.gl;
      this.renderer.beginParticlePass();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, count*8));
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
      this.renderer.endParticlePass();
      this.renderer.drawCalls++;
    }
    clear() { this.particles.length = 0; }
  }

  const INPUT_ACTIONS = Object.freeze(Object.fromEntries(Object.entries({
    moveForward:{label:'Avancer',codes:['KeyW','KeyZ','ArrowUp']},
    moveBack:{label:'Reculer',codes:['KeyS','ArrowDown']},
    moveLeft:{label:'Aller à gauche',codes:['KeyA','KeyQ','ArrowLeft']},
    moveRight:{label:'Aller à droite',codes:['KeyD','ArrowRight']},
    sprint:{label:'Courir',codes:['ShiftLeft','ShiftRight']},
    jump:{label:'Sauter',codes:['Space']},
    reload:{label:'Recharger',codes:['KeyR']},
    grenade:{label:'Grenade',codes:['KeyG']},
    ability:{label:'Capacité',codes:['KeyC']},
    melee:{label:'Coup de crosse',codes:['KeyV']},
    interact:{label:'Interagir',codes:['KeyE']},
    nextWave:{label:'Office suivant',codes:['Enter','KeyF']},
    weapon1:{label:'Arme 1',codes:['Digit1']},
    weapon2:{label:'Arme 2',codes:['Digit2']},
    weapon3:{label:'Arme 3',codes:['Digit3']},
    weapon4:{label:'Arme 4',codes:['Digit4']},
    weapon5:{label:'Arme 5',codes:['Digit5']},
    weapon6:{label:'Arme 6',codes:['Digit6']},
    fire:{label:'Tirer',codes:['Mouse0']},
    aim:{label:'Viser',codes:['Mouse2']}
  }).map(([id, action]) => [id, Object.freeze({label:action.label,codes:Object.freeze(action.codes)})])));
  const INPUT_CODES = new Set([
    ...Array.from({length:26},(_,i)=>'Key'+String.fromCharCode(65+i)),
    ...Array.from({length:10},(_,i)=>'Digit'+i), ...Array.from({length:10},(_,i)=>'Numpad'+i),
    ...Array.from({length:5},(_,i)=>'Mouse'+i),
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','NumpadEnter',
    'ShiftLeft','ShiftRight','ControlLeft','ControlRight','CapsLock','Backspace','Delete','Insert','Home','End','PageUp','PageDown',
    'Backquote','Minus','Equal','BracketLeft','BracketRight','Backslash','IntlBackslash','Semicolon','Quote','Comma','Period','Slash',
    'NumLock','NumpadAdd','NumpadSubtract','NumpadMultiply','NumpadDivide','NumpadDecimal'
  ]);
  const INPUT_LABELS = {Mouse0:'Clic gauche',Mouse1:'Clic milieu',Mouse2:'Clic droit',Mouse3:'Souris 4',Mouse4:'Souris 5',Space:'Espace',Enter:'Entrée',NumpadEnter:'Entrée pavé',ShiftLeft:'Maj gauche',ShiftRight:'Maj droite',ControlLeft:'Ctrl gauche',ControlRight:'Ctrl droite',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Backspace:'Retour arrière',Delete:'Suppr',Home:'Début',End:'Fin',PageUp:'Page ↑',PageDown:'Page ↓'};

  class Input {
    static get ACTIONS() { return INPUT_ACTIONS; }
    static defaultBindings() { return Object.fromEntries(Object.keys(INPUT_ACTIONS).map(id => [id, ''])); }
    static isBindingCode(code) { return typeof code === 'string' && INPUT_CODES.has(code); }
    static validateBindings(value) {
      const bindings = Input.defaultBindings();
      const invalid = error => ({ bindings:Input.defaultBindings(), valid:false, error });
      if (value === undefined) return { bindings, valid:true, error:null };
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Configuration de commandes invalide.');
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== null && (Object.getPrototypeOf(prototype) !== null || !Object.hasOwn(prototype, 'hasOwnProperty'))) return invalid('Prototype de commandes interdit.');
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key !== 'string' || !Object.hasOwn(INPUT_ACTIONS, key)) return invalid('Action de commande inconnue.');
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !Object.hasOwn(descriptor, 'value')) return invalid('Configuration de commandes illisible.');
          const code = descriptor.value;
          if (typeof code !== 'string' || (code !== '' && !Input.isBindingCode(code))) return invalid('Touche réservée ou inconnue pour ' + INPUT_ACTIONS[key].label + '.');
          bindings[key] = code;
        }
        const owners = new Map();
        for (const [id, action] of Object.entries(INPUT_ACTIONS)) {
          for (const code of bindings[id] ? [bindings[id]] : action.codes) {
            if (owners.has(code)) return invalid('Conflit entre ' + INPUT_ACTIONS[owners.get(code)].label + ' et ' + action.label + '.');
            owners.set(code, id);
          }
        }
        return { bindings, valid:true, error:null };
      } catch { return invalid('Configuration de commandes illisible.'); }
    }
    static bindingLabel(action, bindings) {
      if (!Object.hasOwn(INPUT_ACTIONS, action)) return '';
      const definition = INPUT_ACTIONS[action];
      if (!definition) return '';
      const normalized = Input.validateBindings(bindings).bindings;
      const codes = normalized[action] ? [normalized[action]] : definition.codes;
      return codes.map(code => INPUT_LABELS[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Pavé ')).join(' / ');
    }
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = new Set();
      this.pressed = new Set();
      this.released = new Set();
      this.mouseButtons = new Set();
      this.mousePressed = new Set();
      this.mouseReleased = new Set();
      this.virtualKeys = new Set();
      this.virtualPressed = new Set();
      this.virtualMouseButtons = new Set();
      this.virtualMousePressed = new Set();
      this._touchResets = [];
      this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
      this.pointerLocked = false;
      this.lockRequestPending = false;
      this.touchCapable = Boolean(
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
        window.matchMedia?.('(any-pointer: coarse)').matches
      );
      const primaryPointerIsCoarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
      const primaryPointerIsFine = Boolean(window.matchMedia?.('(pointer: fine)').matches);
      this.touchMode = this.touchCapable && primaryPointerIsCoarse && !primaryPointerIsFine;
      this.enabled = true;
      this.onLockChange = null;
      this.setBindings(Input.defaultBindings());
      this._bind();
      this._bindTouchControls();
    }
    _bind() {
      window.addEventListener('keydown', event => {
        if (!this._canCapture(event) || event.repeat || !this._activeBindingCodes.has(event.code)) return;
        if (!this.keys.has(event.code)) this.pressed.add(event.code);
        this.keys.add(event.code);
        event.preventDefault();
      }, { passive: false });
      window.addEventListener('keyup', event => {
        // A release must clear gameplay state even after focus moves to a menu.
        this.keys.delete(event.code);
        this.released.add(event.code);
      });
      window.addEventListener('mousedown', event => {
        if (!this._canCapture(event, true) || !this._activeBindingCodes.has('Mouse'+event.button)) return;
        if (!this.mouseButtons.has(event.button)) this.mousePressed.add(event.button);
        this.mouseButtons.add(event.button);
        event.preventDefault();
      });
      window.addEventListener('mouseup', event => {
        this.mouseButtons.delete(event.button); this.mouseReleased.add(event.button);
        if (this._canCapture(event, true) && this._activeBindingCodes.has('Mouse'+event.button)) event.preventDefault();
      });
      window.addEventListener('auxclick', event => {
        if (this._canCapture(event, true) && this._activeBindingCodes.has('Mouse'+event.button)) event.preventDefault();
      });
      window.addEventListener('mousemove', event => {
        if (this.pointerLocked && this.enabled) { this.mouseDX += event.movementX || 0; this.mouseDY += event.movementY || 0; }
      });
      window.addEventListener('wheel', event => {
        if (!this._canCapture(event, true)) return;
        this.wheel += Math.sign(event.deltaY);
        event.preventDefault();
      }, { passive: false });
      window.addEventListener('blur', () => {
        this.clearPhysicalInputs();
        this.clearVirtualInputs();
      });
      document.addEventListener('pointerlockchange', () => {
        this.pointerLocked = document.pointerLockElement === this.canvas;
        if (!this.pointerLocked) this.clearPhysicalInputs();
        this.lockRequestPending = false;
        document.dispatchEvent(new CustomEvent('nt-pointer-lock-change', { detail: { locked: this.pointerLocked } }));
        if (this.onLockChange) this.onLockChange(this.pointerLocked);
      });
      document.addEventListener('pointerlockerror', () => {
        this.lockRequestPending = false;
        document.dispatchEvent(new CustomEvent('nt-pointer-lock-error'));
      });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
      window.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          this._activateTouchMode();
          return;
        }
        if (event.pointerType === 'mouse') {
          const changed = this._activateMouseMode();
          if (changed && event.target === this.canvas && this.enabled && !this.pointerLocked) this.requestLock();
        }
      }, { capture: true });
    }

    _isFormControl(target) {
      return Boolean(target?.isContentEditable || target?.closest?.('input, select, textarea, button, [contenteditable]:not([contenteditable="false"])'));
    }

    _canCapture(event, mouse = false) {
      if (!this.enabled || event.defaultPrevented || event.isComposing || event.metaKey || event.altKey || this._isFormControl(event.target)) return false;
      return this.pointerLocked || (this.touchMode && document.body?.classList.contains('game-active')) || (mouse && event.target === this.canvas);
    }

    setBindings(value) {
      const result = Input.validateBindings(value);
      this.bindings = { ...result.bindings };
      this._boundCodes = Object.create(null);
      this._activeBindingCodes = new Set();
      for (const [id, action] of Object.entries(INPUT_ACTIONS)) {
        const codes = this.bindings[id] ? [this.bindings[id]] : action.codes;
        for (const canonical of action.codes) this._boundCodes[canonical] = codes;
        for (const code of codes) this._activeBindingCodes.add(code);
      }
      this.clearPhysicalInputs();
      return result;
    }

    clearPhysicalInputs() {
      this.keys.clear(); this.pressed.clear(); this.released.clear();
      this.mouseButtons.clear(); this.mousePressed.clear(); this.mouseReleased.clear();
      this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    }

    _physicalHeld(canonical) {
      return (this._boundCodes[canonical] || [canonical]).some(code => code.startsWith('Mouse') ? this.mouseButtons.has(Number(code.slice(5))) : this.keys.has(code));
    }

    _consumePhysical(canonical) {
      let result = false;
      for (const code of this._boundCodes[canonical] || [canonical]) {
        const mouse = code.startsWith('Mouse'), value = mouse ? Number(code.slice(5)) : code;
        const pressed = mouse ? this.mousePressed : this.pressed;
        if (pressed.delete(value)) result = true;
      }
      return result;
    }

    _setTouchMode(active) {
      const next = Boolean(active);
      if (this.touchMode === next) return false;
      this.touchMode = next;
      document.body?.classList.toggle('touch-mode', next);
      if (!next) this.clearVirtualInputs();
      if (next && document.pointerLockElement) this.exitLock();
      document.dispatchEvent(new CustomEvent('nt-input-mode-change', { detail: { touchMode: next } }));
      return true;
    }

    _activateTouchMode() { return this._setTouchMode(true); }
    _activateMouseMode() { return this._setTouchMode(false); }

    _bindTouchControls() {
      const root = document.getElementById('touch-controls');
      const move = document.getElementById('touch-move');
      const knob = document.getElementById('touch-move-knob');
      const look = document.getElementById('touch-look');
      if (!root || !move || !knob || !look) return;

      let movePointer = null;
      const resetMove = () => {
        movePointer = null;
        knob.style.transform = 'translate(-50%, -50%)';
        for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) this.setVirtualKey(code, false);
      };
      const updateMove = event => {
        const rect = move.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width * .5);
        const dy = event.clientY - (rect.top + rect.height * .5);
        const radius = Math.max(28, Math.min(rect.width, rect.height) * .34);
        const length = Math.hypot(dx, dy) || 1;
        const scale = Math.min(1, radius / length);
        const x = dx * scale, y = dy * scale;
        knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        const nx = x / radius, ny = y / radius;
        this.setVirtualKey('KeyA', nx < -.22);
        this.setVirtualKey('KeyD', nx > .22);
        this.setVirtualKey('KeyW', ny < -.22);
        this.setVirtualKey('KeyS', ny > .22);
      };
      move.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || movePointer !== null) return;
        event.preventDefault();
        this._activateTouchMode();
        movePointer = event.pointerId;
        move.setPointerCapture?.(event.pointerId);
        updateMove(event);
      });
      move.addEventListener('pointermove', event => {
        if (event.pointerId !== movePointer) return;
        event.preventDefault();
        updateMove(event);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        move.addEventListener(type, event => {
          if (movePointer !== null && event.pointerId !== movePointer) return;
          resetMove();
        });
      }

      let lookPointer = null, lookX = 0, lookY = 0;
      look.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || lookPointer !== null) return;
        event.preventDefault();
        this._activateTouchMode();
        lookPointer = event.pointerId;
        lookX = event.clientX;
        lookY = event.clientY;
        look.setPointerCapture?.(event.pointerId);
      });
      look.addEventListener('pointermove', event => {
        if (event.pointerId !== lookPointer) return;
        event.preventDefault();
        this.addLookDelta((event.clientX - lookX) * 1.15, (event.clientY - lookY) * 1.15);
        lookX = event.clientX;
        lookY = event.clientY;
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        look.addEventListener(type, event => {
          if (lookPointer !== null && event.pointerId !== lookPointer) return;
          lookPointer = null;
        });
      }
      this._touchResets.push(resetMove, () => { lookPointer = null; });

      root.querySelectorAll('[data-key], [data-mouse], [data-wheel]').forEach(button => {
        const pointers = new Set();
        const reset = () => {
          pointers.clear();
          if (button.dataset.key) this.setVirtualKey(button.dataset.key, false);
          if (button.dataset.mouse !== undefined) this.setVirtualMouse(Number(button.dataset.mouse), false);
          button.classList.remove('pressed');
        };
        const release = event => { if (pointers.delete(event.pointerId) && !pointers.size) reset(); };
        this._touchResets.push(reset);
        button.addEventListener('pointerdown', event => {
          if (event.pointerType === 'mouse' && !this.touchMode) return;
          if (pointers.has(event.pointerId)) return;
          event.preventDefault();
          this._activateTouchMode();
          pointers.add(event.pointerId);
          button.setPointerCapture?.(event.pointerId);
          button.classList.add('pressed');
          if (button.dataset.key) this.setVirtualKey(button.dataset.key, true);
          if (button.dataset.mouse !== undefined) this.setVirtualMouse(Number(button.dataset.mouse), true);
          if (button.dataset.wheel) this.addWheel(Number(button.dataset.wheel));
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      });
    }

    setVirtualKey(code, active) {
      if (active) {
        if (!this.virtualKeys.has(code)) this.virtualPressed.add(code);
        this.virtualKeys.add(code);
      } else this.virtualKeys.delete(code);
    }

    setVirtualMouse(button, active) {
      if (active) {
        if (!this.virtualMouseButtons.has(button)) this.virtualMousePressed.add(button);
        this.virtualMouseButtons.add(button);
      } else this.virtualMouseButtons.delete(button);
    }

    addLookDelta(dx, dy) {
      if (!this.enabled) return;
      this.mouseDX += Number(dx) || 0;
      this.mouseDY += Number(dy) || 0;
    }

    addWheel(delta) { this.wheel += Math.sign(Number(delta) || 0); }

    clearVirtualInputs() {
      this.virtualKeys.clear();
      this.virtualPressed.clear();
      this.virtualMouseButtons.clear();
      this.virtualMousePressed.clear();
      for (const reset of this._touchResets) reset();
    }

    requestLock() {
      if (this.touchMode) return Promise.resolve(true);
      if (!this.canvas.requestPointerLock) {
        document.dispatchEvent(new CustomEvent('nt-pointer-lock-error'));
        return Promise.resolve(false);
      }
      this.lockRequestPending = true;
      return new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          document.removeEventListener('pointerlockchange', onChange);
          document.removeEventListener('pointerlockerror', onError);
          this.lockRequestPending = false;
          resolve(value);
        };
        const onChange = () => finish(document.pointerLockElement === this.canvas);
        const onError = () => finish(false);
        const timeout = setTimeout(() => finish(document.pointerLockElement === this.canvas), 900);
        document.addEventListener('pointerlockchange', onChange);
        document.addEventListener('pointerlockerror', onError);
        try {
          const result = this.canvas.requestPointerLock();
          result?.catch?.(() => finish(false));
        } catch {
          finish(false);
          document.dispatchEvent(new CustomEvent('nt-pointer-lock-error'));
        }
      });
    }

    exitLock() {
      this.lockRequestPending = false;
      if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    }

    combatReady() { return this.touchMode || this.pointerLocked; }
    key(code) { return this._physicalHeld(code) || this.virtualKeys.has(code); }
    keyAny(...codes) { return codes.some(code => this.key(code)); }
    consume(code) {
      const physical = this._consumePhysical(code);
      const result = physical || this.virtualPressed.has(code);
      this.virtualPressed.delete(code);
      return result;
    }
    mouse(button) { return this._physicalHeld('Mouse'+button) || this.virtualMouseButtons.has(button); }
    consumeMouse(button) {
      const physical = this._consumePhysical('Mouse'+button);
      const result = physical || this.virtualMousePressed.has(button);
      this.virtualMousePressed.delete(button);
      return result;
    }
    endFrame() {
      this.pressed.clear(); this.released.clear(); this.mousePressed.clear(); this.mouseReleased.clear();
      this.virtualPressed.clear(); this.virtualMousePressed.clear();
      this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    }
  }

  class SaveStore {
    constructor(key, defaults = {}) {
      this.key = key;
      this.defaults = structuredCloneSafe(defaults);
      this.status = { available:true, dirty:false, recovered:false, conflict:false, futureVersion:null, error:null };
      this.recoveryBackup = null;
      this._lastRaw = null;
      this._hasRead = false;
      this.data = this.load();
    }
    _notify() {
      if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('nt-save-status', { detail:{ ...this.status } }));
      }
    }
    _normalize(raw, strict = false) {
      const issues = [];
      const invalid = path => { issues.push(path || 'racine'); };
      const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
      const forbidden = key => ['__proto__', 'prototype', 'constructor'].includes(key);
      const limits = {
        'settings.sensitivity':[.25,2.5], 'settings.volume':[0,1], 'settings.fov':[65,105],
        'settings.renderScale':[.55,1.5], 'settings.hudScale':[.75,1.3], 'settings.shakeIntensity':[0,1]
      };
      const checkTree = (value, path = '', depth = 0) => {
        if (depth > 12) { invalid(path); return false; }
        if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
        if (typeof value === 'string') return value.length <= 4096;
        if (value === null || typeof value === 'boolean') return true;
        if (!value || typeof value !== 'object' || (Array.isArray(value) && value.length > 128)) return false;
        return Object.entries(value).every(([key, entry]) => !forbidden(key) && checkTree(entry, path + '.' + key, depth + 1));
      };
      const equalData = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equalData(a[key], b[key]));
      };
      const walk = (value, template, path = '') => {
        if (path === 'progression' && NT.Progression) {
          const result = NT.Progression.normalize(value, { strict });
          if (result.repaired) invalid(path);
          return result.data;
        }
        if (path === 'settings.bindings') {
          const result = Input.validateBindings(value);
          if (!result.valid) invalid(path);
          return result.bindings;
        }
        if (path === 'activeRun') {
          if (value === null) return null;
          if (!plain(value) || ![1,2].includes(value.version) || !checkTree(value, path)) { invalid(path); return null; }
          const validator = NT.NexusGame?.prototype?._validateActiveRun;
          if (!validator) return structuredCloneSafe(value);
          let canonical;
          try { canonical = validator.call(NT.NexusGame.prototype, value); } catch { canonical = null; }
          if (!canonical) { invalid(path); return null; }
          if (Number.isFinite(value.savedAt) && value.savedAt >= 0) canonical.savedAt = value.savedAt;
          // Migration explicite du checkpoint v1 : comparer d’abord son contrat
          // historique complet, sans accepter des valeurs invalides sous prétexte
          // de migration. La seule extension légitime est v2 + story:null.
          const compared = value.version === 1 && canonical.version === 2
            ? { ...canonical, version:1 } : canonical;
          if (compared !== canonical) delete compared.story;
          if (!equalData(value, compared)) invalid(path);
          return canonical;
        }
        if (plain(template)) {
          if (!plain(value)) { invalid(path); return structuredCloneSafe(template); }
          const result = {};
          if (path === 'codex.enemyKills') {
            for (const [key, count] of Object.entries(value)) {
              if (forbidden(key) || (NT.Data?.ENEMIES && !Object.prototype.hasOwnProperty.call(NT.Data.ENEMIES, key)) || !Number.isInteger(count) || count < 0 || count > 1e9) { invalid(path + '.' + key); continue; }
              result[key] = count;
            }
            return result;
          }
          for (const key of Object.keys(value)) {
            if (forbidden(key) || !Object.prototype.hasOwnProperty.call(template, key)) invalid(path + '.' + key);
          }
          for (const [key, fallback] of Object.entries(template)) {
            if (forbidden(key)) continue;
            result[key] = Object.prototype.hasOwnProperty.call(value, key)
              ? walk(value[key], fallback, path ? path + '.' + key : key)
              : structuredCloneSafe(fallback);
          }
          return result;
        }
        if (typeof template === 'number') {
          let [min, max] = limits[path] || [0, 1e12];
          if (path.startsWith('meta.')) max = NT.Data?.META_UPGRADES?.[path.slice(5)]?.max ?? 5;
          if (path === 'version') {
            if (!Number.isInteger(value) || value < 1 || value > template) invalid(path);
            return template;
          }
          const whole = path === 'shards' || path.startsWith('meta.') || ['records.bestWave','records.bestScore','records.lifetimeKills','records.bossKills','records.headshots','records.runs'].includes(path);
          if (typeof value !== 'number' || !Number.isFinite(value)) { invalid(path); return template; }
          const bounded = clamp(whole ? Math.floor(value) : value, min, max);
          if (bounded !== value) invalid(path);
          return bounded;
        }
        if (typeof value !== typeof template || (template === null && value !== null)) { invalid(path); return structuredCloneSafe(template); }
        return value;
      };
      if (!checkTree(raw)) invalid('structure');
      if (strict && Object.prototype.hasOwnProperty.call(this.defaults, 'version') && !Object.prototype.hasOwnProperty.call(raw || {}, 'version')) invalid('version');
      const data = walk(plain(raw) ? raw : {}, this.defaults);
      if (!plain(raw)) invalid('racine');
      return { data, repaired:issues.length > 0, error:strict && issues.length ? 'Sauvegarde invalide : ' + [...new Set(issues)].slice(0, 5).join(', ') : null };
    }
    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(this.key);
        this._lastRaw = raw;
        this._hasRead = true;
        if (raw === null) return structuredCloneSafe(this.defaults);
        if (raw.length > 262144) throw new Error('Sauvegarde trop volumineuse.');
        const parsed = JSON.parse(raw);
        if (Number.isInteger(parsed?.version) && Number.isInteger(this.defaults.version) && parsed.version > this.defaults.version) {
          // Une ancienne application ne migre jamais un format plus récent vers le bas.
          // Le brut reste en mémoire ET sur disque ; même la clé de secours reste intacte.
          this.recoveryBackup = raw;
          this.status.futureVersion = parsed.version;
          this.status.error = 'Sauvegarde d’une version plus récente : mettez le jeu à jour avant toute écriture.';
          return structuredCloneSafe(this.defaults);
        }
        const result = this._normalize(parsed);
        if (result.repaired) this._preserveRecovery(raw);
        return result.data;
      } catch (error) {
        if (raw !== null) this._preserveRecovery(raw);
        else { this.status.available = false; this.status.error = String(error.message || error); }
        return structuredCloneSafe(this.defaults);
      } finally { this._notify(); }
    }
    _preserveRecovery(raw) {
      this.recoveryBackup = raw;
      this.status.recovered = true;
      this.status.dirty = true;
      this.status.error = 'Sauvegarde réparée ; une copie de récupération est conservée.';
      try { localStorage.setItem(this.key + ':recovery', raw); } catch { /* Copie encore disponible en mémoire. */ }
    }
    checkExternalChanges() {
      if (this.status.conflict || this.status.futureVersion !== null) return true;
      try {
        const raw = localStorage.getItem(this.key);
        if (!this._hasRead || raw !== this._lastRaw) {
          // Ne pas adopter la nouvelle valeur comme base : le brouillon local doit
          // rester exportable, mais seul un rechargement pourra autoriser des écritures.
          Object.assign(this.status, { available:true, dirty:true, conflict:true, error:'Progression modifiée dans un autre onglet. Exportez votre copie puis rechargez le jeu.' });
          if (raw !== null && raw.length <= 262144) {
            try {
              const parsed = JSON.parse(raw);
              if (Number.isInteger(parsed?.version) && Number.isInteger(this.defaults.version) && parsed.version > this.defaults.version) {
                this.status.futureVersion = parsed.version;
                this.recoveryBackup = raw;
              }
            } catch { /* Même une suppression/corruption externe ne sera pas écrasée. */ }
          }
          this._notify();
          return true;
        }
        return false;
      } catch (error) {
        Object.assign(this.status, { available:false, dirty:true, error:String(error.message || error) });
        this._notify();
        return true;
      }
    }
    save() {
      try {
        // Contrôle synchrone au plus près de l’écriture, même sans événement storage.
        // localStorage n’offre pas de transaction inter-onglets : ce garde détecte
        // un instantané périmé, sans prétendre verrouiller deux écritures simultanées.
        if (this.checkExternalChanges()) return false;
        const result = this._normalize(this.data);
        if (result.repaired) this.status.recovered = true;
        // Conserver l’identité de la racine : les transactions UI peuvent encore la restaurer.
        for (const key of Object.keys(this.data)) delete this.data[key];
        Object.assign(this.data, result.data);
        const encoded = JSON.stringify(this.data);
        localStorage.setItem(this.key, encoded);
        this._lastRaw = encoded;
        Object.assign(this.status, { available:true, dirty:false, error:null });
        return true;
      } catch (error) {
        Object.assign(this.status, { available:false, dirty:true, error:String(error.message || error) });
        return false;
      } finally { this._notify(); }
    }
    exportJSON() { return JSON.stringify(this._normalize(this.data).data, null, 2); }
    importJSON(text) {
      if (typeof text !== 'string' || text.length > 262144) return { ok:false, error:'Fichier de sauvegarde invalide ou supérieur à 256 Ko.' };
      let candidate;
      try {
        const parsed = JSON.parse(text);
        candidate = this._normalize(parsed, true);
        if (candidate.error) return { ok:false, error:candidate.error };
        if (this.checkExternalChanges()) return { ok:false, error:this.status.error || 'Sauvegarde protégée : rechargez le jeu.' };
        const encoded = JSON.stringify(candidate.data);
        localStorage.setItem(this.key, encoded);
        this._lastRaw = encoded;
      } catch (error) {
        if (candidate) {
          Object.assign(this.status, { available:false, dirty:true, error:String(error.message || error) });
          this._notify();
        }
        return { ok:false, error:candidate ? 'Stockage indisponible : import non appliqué.' : 'Le fichier ne contient pas une sauvegarde JSON valide.' };
      }
      this.data = candidate.data;
      Object.assign(this.status, { available:true, dirty:false, recovered:false, error:null });
      this._notify();
      return { ok:true, persisted:true };
    }
    reset() { this.data = structuredCloneSafe(this.defaults); this.save(); }
  }

  function structuredCloneSafe(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const [key, value] of Object.entries(source)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = deepMerge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
      else target[key] = value;
    }
    return target;
  }

  function createPart(mesh, material, position = [0,0,0], rotation = [0,0,0], scale = [1,1,1], options = {}) {
    return {
      mesh, material,
      position: new Vec3(position[0],position[1],position[2]),
      rotation: new Vec3(rotation[0],rotation[1],rotation[2]),
      scale: new Vec3(scale[0],scale[1],scale[2]),
      phase: options.phase ?? 0,
      animation: options.animation ?? null,
      visible: options.visible !== false,
      tag: options.tag || ''
    };
  }

  const _cameraEye = new Vec3();
  const _cameraTarget = new Vec3();

  NT.Engine = {
    Transform, Material, Mesh, Geometry, Camera, Renderer, ParticleSystem, Input, SaveStore,
    createPart, modelMatrixBetween, structuredCloneSafe, deepMerge
  };
})();

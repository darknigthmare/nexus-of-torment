(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const EPSILON = 1e-6;
  const TAU = Math.PI * 2;

  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vec3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiply(v) { this.x *= v.x; this.y *= v.y; this.z *= v.z; return this; }
    scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    length() { return Math.sqrt(this.lengthSq()); }
    lengthXZ() { return Math.hypot(this.x, this.z); }
    normalize() { const len = this.length(); if (len > EPSILON) this.scale(1 / len); return this; }
    normalizeXZ() { const len = Math.hypot(this.x, this.z); if (len > EPSILON) { this.x /= len; this.z /= len; } return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    cross(v) {
      const x = this.y * v.z - this.z * v.y;
      const y = this.z * v.x - this.x * v.z;
      const z = this.x * v.y - this.y * v.x;
      this.x = x; this.y = y; this.z = z;
      return this;
    }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    distanceToXZ(v) { return Math.hypot(this.x - v.x, this.z - v.z); }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    equals(v, e = EPSILON) { return Math.abs(this.x - v.x) < e && Math.abs(this.y - v.y) < e && Math.abs(this.z - v.z) < e; }
    static add(a, b, out = new Vec3()) { return out.set(a.x + b.x, a.y + b.y, a.z + b.z); }
    static sub(a, b, out = new Vec3()) { return out.set(a.x - b.x, a.y - b.y, a.z - b.z); }
    static cross(a, b, out = new Vec3()) { return out.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    static fromArray(a, i = 0, out = new Vec3()) { return out.set(a[i], a[i + 1], a[i + 2]); }
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function saturate(value) { return clamp(value, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function inverseLerp(a, b, v) { return Math.abs(b - a) < EPSILON ? 0 : (v - a) / (b - a); }
  function smoothstep(a, b, v) { const t = saturate(inverseLerp(a, b, v)); return t * t * (3 - 2 * t); }
  function smootherstep(a, b, v) { const t = saturate(inverseLerp(a, b, v)); return t * t * t * (t * (t * 6 - 15) + 10); }
  function damp(current, target, lambda, dt) { return lerp(current, target, 1 - Math.exp(-lambda * dt)); }
  function wrapAngle(angle) { angle %= TAU; if (angle > Math.PI) angle -= TAU; if (angle < -Math.PI) angle += TAU; return angle; }
  function deltaAngle(a, b) { return wrapAngle(b - a); }
  function randRange(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, maxInclusive) { return Math.floor(randRange(min, maxInclusive + 1)); }
  function chance(probability) { return Math.random() < probability; }
  function pick(array) { return array[Math.floor(Math.random() * array.length)]; }
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  function weightedPick(entries, weightKey = 'weight') {
    let total = 0;
    for (const entry of entries) total += Math.max(0, entry[weightKey] ?? 1);
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= Math.max(0, entry[weightKey] ?? 1);
      if (roll <= 0) return entry;
    }
    return entries[entries.length - 1];
  }
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function mat4() { const out = new Float32Array(16); out[0] = out[5] = out[10] = out[15] = 1; return out; }
  function mat4Identity(out) {
    out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; return out;
  }
  function mat4Copy(out, a) { out.set(a); return out; }
  function mat4Multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  }
  function mat4Perspective(out, fovRadians, aspect, near, far) {
    const f = 1 / Math.tan(fovRadians / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[11] = -1;
    if (far !== Infinity) {
      const nf = 1 / (near - far);
      out[10] = (far + near) * nf;
      out[14] = 2 * far * near * nf;
    } else {
      out[10] = -1;
      out[14] = -2 * near;
    }
    return out;
  }
  function mat4LookAt(out, eye, center, up) {
    let z0 = eye.x - center.x, z1 = eye.y - center.y, z2 = eye.z - center.z;
    let len = Math.hypot(z0, z1, z2);
    if (len < EPSILON) z2 = 1; else { z0 /= len; z1 /= len; z2 /= len; }
    let x0 = up.y * z2 - up.z * z1;
    let x1 = up.z * z0 - up.x * z2;
    let x2 = up.x * z1 - up.y * z0;
    len = Math.hypot(x0, x1, x2);
    if (len < EPSILON) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= len; x1 /= len; x2 /= len; }
    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;
    len = Math.hypot(y0, y1, y2);
    if (len > EPSILON) { y0 /= len; y1 /= len; y2 /= len; }
    out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
    out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
    out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
    out[12] = -(x0 * eye.x + x1 * eye.y + x2 * eye.z);
    out[13] = -(y0 * eye.x + y1 * eye.y + y2 * eye.z);
    out[14] = -(z0 * eye.x + z1 * eye.y + z2 * eye.z);
    out[15] = 1;
    return out;
  }
  function mat4FromTransform(out, position, rotation, scale) {
    const x = rotation.x * 0.5, y = rotation.y * 0.5, z = rotation.z * 0.5;
    const sx = Math.sin(x), cx = Math.cos(x);
    const sy = Math.sin(y), cy = Math.cos(y);
    const sz = Math.sin(z), cz = Math.cos(z);
    const qx = sx * cy * cz + cx * sy * sz;
    const qy = cx * sy * cz - sx * cy * sz;
    const qz = cx * cy * sz + sx * sy * cz;
    const qw = cx * cy * cz - sx * sy * sz;
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    out[0] = (1 - (yy + zz)) * scale.x;
    out[1] = (xy + wz) * scale.x;
    out[2] = (xz - wy) * scale.x;
    out[3] = 0;
    out[4] = (xy - wz) * scale.y;
    out[5] = (1 - (xx + zz)) * scale.y;
    out[6] = (yz + wx) * scale.y;
    out[7] = 0;
    out[8] = (xz + wy) * scale.z;
    out[9] = (yz - wx) * scale.z;
    out[10] = (1 - (xx + yy)) * scale.z;
    out[11] = 0;
    out[12] = position.x;
    out[13] = position.y;
    out[14] = position.z;
    out[15] = 1;
    return out;
  }
  function mat4Translate(out, a, v) {
    const x = v.x, y = v.y, z = v.z;
    if (out === a) {
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
      out.set(a);
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    }
    return out;
  }
  function mat4Invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }
  function mat3NormalFromMat4(out, a) {
    const inv = mat4Invert(_scratchMat4, a);
    if (!inv) {
      out[0] = out[4] = out[8] = 1;
      out[1] = out[2] = out[3] = out[5] = out[6] = out[7] = 0;
      return out;
    }
    out[0] = inv[0]; out[1] = inv[4]; out[2] = inv[8];
    out[3] = inv[1]; out[4] = inv[5]; out[5] = inv[9];
    out[6] = inv[2]; out[7] = inv[6]; out[8] = inv[10];
    return out;
  }
  function transformPointMat4(out, v, m) {
    const x = v.x, y = v.y, z = v.z;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    out.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
  }
  function transformDirectionMat4(out, v, m) {
    const x = v.x, y = v.y, z = v.z;
    out.x = m[0] * x + m[4] * y + m[8] * z;
    out.y = m[1] * x + m[5] * y + m[9] * z;
    out.z = m[2] * x + m[6] * y + m[10] * z;
    return out.normalize();
  }

  function cameraBasis(yaw, pitch, forwardOut, rightOut, upOut) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
    forwardOut.set(sy * cp, sp, -cy * cp).normalize();
    rightOut.set(cy, 0, sy).normalize();
    Vec3.cross(rightOut, forwardOut, upOut).normalize();
    return { forward: forwardOut, right: rightOut, up: upOut };
  }

  function raySphere(origin, direction, center, radius) {
    const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
    const b = ox * direction.x + oy * direction.y + oz * direction.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const h = b * b - c;
    if (h < 0) return Infinity;
    const s = Math.sqrt(h);
    const t1 = -b - s;
    const t2 = -b + s;
    if (t1 >= 0) return t1;
    if (t2 >= 0) return t2;
    return Infinity;
  }
  function rayAabb(origin, direction, min, max) {
    let tmin = -Infinity, tmax = Infinity;
    for (const axis of ['x', 'y', 'z']) {
      const inv = Math.abs(direction[axis]) < EPSILON ? Infinity : 1 / direction[axis];
      let t1 = (min[axis] - origin[axis]) * inv;
      let t2 = (max[axis] - origin[axis]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    if (tmax < 0) return Infinity;
    return tmin >= 0 ? tmin : tmax;
  }
  function pointInAabb(point, min, max) {
    return point.x >= min.x && point.x <= max.x && point.y >= min.y && point.y <= max.y && point.z >= min.z && point.z <= max.z;
  }
  function resolveCircleAabb(position, radius, min, max) {
    const closestX = clamp(position.x, min.x, max.x);
    const closestZ = clamp(position.z, min.z, max.z);
    let dx = position.x - closestX;
    let dz = position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) return false;
    if (distSq > EPSILON) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      position.x += dx / dist * push;
      position.z += dz / dist * push;
    } else {
      const left = Math.abs(position.x - min.x);
      const right = Math.abs(max.x - position.x);
      const bottom = Math.abs(position.z - min.z);
      const top = Math.abs(max.z - position.z);
      const smallest = Math.min(left, right, bottom, top);
      if (smallest === left) position.x = min.x - radius;
      else if (smallest === right) position.x = max.x + radius;
      else if (smallest === bottom) position.z = min.z - radius;
      else position.z = max.z + radius;
    }
    return true;
  }
  function segmentPointDistanceSq(a, b, p) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
    const denom = abx * abx + aby * aby + abz * abz;
    const t = denom > EPSILON ? clamp((apx * abx + apy * aby + apz * abz) / denom, 0, 1) : 0;
    const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
    return dx * dx + dy * dy + dz * dz;
  }

  function colorHex(hex) {
    if (typeof hex === 'string') hex = parseInt(hex.replace('#', ''), 16);
    return new Float32Array([((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, 1]);
  }
  function colorRGBA(r, g, b, a = 1) { return new Float32Array([r, g, b, a]); }

  const _scratchMat4 = mat4();

  NT.Math = {
    EPSILON, TAU, Vec3,
    clamp, saturate, lerp, inverseLerp, smoothstep, smootherstep, damp, wrapAngle, deltaAngle,
    randRange, randInt, chance, pick, shuffle, weightedPick, hash2, hash3,
    mat4, mat4Identity, mat4Copy, mat4Multiply, mat4Perspective, mat4LookAt, mat4FromTransform,
    mat4Translate, mat4Invert, mat3NormalFromMat4, transformPointMat4, transformDirectionMat4, cameraBasis,
    raySphere, rayAabb, pointInAabb, resolveCircleAabb, segmentPointDistanceSq,
    colorHex, colorRGBA
  };
})();

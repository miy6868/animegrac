// Simple stylized props. Keep props big, simple and in few colors.
import { BoxGeometry, Mesh, Group, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry } from 'three';

/**
 * A plain block (bench / pedestal / step). Pivot is at the bottom center.
 * @param {AnimeStyle} style
 * @param {object} o { size: [w,h,d], color, shadow, line }
 */
export function createBlock(style, { size = [1, 0.5, 1], color = '#4a93ec', shadow, line, outline = true, thresholdBias = 0, name = 'block' } = {}) {
  const g = new BoxGeometry(size[0], size[1], size[2]);
  g.translate(0, size[1] / 2, 0);
  const m = new Mesh(g);
  m.name = name;
  style.stylize(m, { kind: 'prop', color, shadow, line, outline, thresholdBias });
  return m;
}

/** A small set of props to check the style on non-character objects. */
export function createProps(style, palette = {}) {
  const c = { a: '#ffd166', b: '#ef476f', c: '#ffffff', d: '#26547c', ...palette };
  const group = new Group();
  const add = (geo, color, pos, kind = 'prop') => {
    const m = new Mesh(geo);
    style.stylize(m, { kind, color });
    m.position.set(...pos);
    group.add(m);
    return m;
  };
  add(new SphereGeometry(0.18, 48, 32), c.a, [0, 0.18, 0]);
  add(new CylinderGeometry(0.12, 0.14, 0.32, 48), c.b, [0.45, 0.16, 0.05]);
  add(new ConeGeometry(0.14, 0.34, 48), c.c, [-0.42, 0.17, 0.1]);
  const t = add(new TorusGeometry(0.11, 0.045, 24, 64), c.d, [0.12, 0.06, 0.38]);
  t.rotation.x = Math.PI / 2;
  return group;
}

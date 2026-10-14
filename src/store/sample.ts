import i18n from '../i18n';
import { buildSample, type SampleNode } from '../domain/factory';
import type { ProjectDoc } from '../domain/types';

/** Website relaunch sample that shows hierarchy, links, milestones, a deadline and people. */
export function buildSampleProject(): ProjectDoc {
  const n = (key: string) => i18n.t(`sample.items.${key}`) as string;
  const node = (key: string, extra: Omit<SampleNode, 'key' | 'name'> = {}): SampleNode => ({
    key,
    name: n(key),
    ...extra,
  });

  const outline: SampleNode[] = [
    node('p1', {
      children: [
        node('ws1', {
          children: [
            node('t1', { days: 5, assignees: [0] }),
            node('t2', { days: 4, assignees: [1] }),
          ],
        }),
        node('ws2', {
          children: [
            node('t3', {
              children: [
                node('t3a', { days: 3, assignees: [2] }),
                node('t3b', { days: 2, assignees: [2] }),
              ],
            }),
            node('t4', { days: 6, assignees: [2, 0] }),
          ],
        }),
        node('m1', { days: 0, assignees: [0] }),
      ],
    }),
    node('p2', {
      children: [
        node('ws3', {
          children: [
            node('t5', { days: 8, assignees: [2] }),
            node('t6', { days: 6, assignees: [2] }),
          ],
        }),
        node('ws4', {
          children: [
            node('t7', { days: 12, assignees: [1, 3] }),
            node('t8', { days: 8, assignees: [3] }),
            node('t9', { days: 6, assignees: [1] }),
          ],
        }),
      ],
    }),
    node('p3', {
      children: [
        node('t10', { days: 4, assignees: [0, 1] }),
        node('t11', { days: 0, assignees: [0] }),
        node('d1', { days: -1, offset: 84 }),
      ],
    }),
  ];

  return buildSample(
    {
      projectName: i18n.t('sample.projectName'),
      levels: i18n.t('defaults.levels', { returnObjects: true }) as string[],
      people: i18n.t('sample.people', { returnObjects: true }) as string[],
      outline,
    },
    [
      ['t1', 't3a', true],
      ['t3a', 't3b', true],
      ['t3b', 't4', true],
      ['t4', 'm1', true],
      ['t2', 't9', true],
      ['m1', 'ws3', true],
      ['m1', 't8', true],
      ['t5', 't6', true],
      ['t6', 't7', true],
      ['t8', 't9', true],
      ['t7', 't10', true],
      ['t9', 't10', true],
      ['t10', 't11', true],
      ['t11', 'd1', true],
      ['t1', 't5', false],
      ['t2', 't8', false],
    ],
  );
}

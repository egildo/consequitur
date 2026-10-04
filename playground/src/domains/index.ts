// The domains the page offers, in the order of its picker.

import type { Domain } from '../domain.ts';
import { editorial } from './editorial.ts';
import { sibar } from './sibar.ts';

export const DOMAINS: Domain[] = [sibar, editorial];

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { addWorkingDays } from './working-days.js';

@Injectable()
export class BusinessTimeService {
  readonly timeZone: string;

  constructor(config: ConfigService<Environment, true>) {
    this.timeZone =
      config.get('BUSINESS_TIME_ZONE', { infer: true }) ?? 'Asia/Kolkata';
  }

  businessDate(value: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  deadline(
    visitEndDate: string,
    workingDays: number,
    calendar: Map<string, boolean> = new Map(),
  ): string {
    return addWorkingDays(visitEndDate, workingDays, calendar);
  }
}

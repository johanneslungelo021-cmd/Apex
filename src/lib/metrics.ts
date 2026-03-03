import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('apex-sentient');

export const pageViewCounter = meter.createCounter('apex_page_view_total', {
  description: 'Total page views'
});

export const registrationCounter = meter.createCounter('apex_registration_total', {
  description: 'Total successful registrations'
});

export const chatSessionCounter = meter.createCounter('apex_chat_session_total', {
  description: 'Total AI chat sessions'
});

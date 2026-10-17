import { EventEmitter } from 'events';

export const agentEvents = new EventEmitter();

export function emitLog(level: 'info'|'warn'|'error'|'success', message: string, data?: any) {
    console.log([] );
    agentEvents.emit('log', { level, message, data, timestamp: new Date().toISOString() });
}

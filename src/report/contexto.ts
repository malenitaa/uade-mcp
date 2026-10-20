// Qué tool está corriendo, para que un error se pueda reportar con su nombre sin pasarlo a mano
// por cada handler. AsyncLocalStorage: dos tools en paralelo no se pisan.
import { AsyncLocalStorage } from 'node:async_hooks';

export const toolActual = new AsyncLocalStorage<string>();

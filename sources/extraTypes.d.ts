import 'prompts';
import {Readable, Writable} from 'stream';

declare module 'prompts' {
  interface Choice {
    description?: string;
    disabled?: boolean;
  }

  interface PromptObject {
    warn?: string;
    stdin?: Readable;
    stdout?: Writable;
  }
}

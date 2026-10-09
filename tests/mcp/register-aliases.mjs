// Lets node --test import app modules that use the "@/..." path alias.
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);

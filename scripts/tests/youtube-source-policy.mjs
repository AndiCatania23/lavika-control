import assert from 'node:assert/strict';
import { sourceProcessingError } from '../../src/lib/video-sources/policy.ts';
assert.equal(sourceProcessingError('youtube', {youtubeOnly:true,discoveryIntervalMinutes:30,descriptionMode:'participants-after-date',youtubeLanguage:'it'}),null);
assert.match(sourceProcessingError('facebook',{youtubeOnly:true}),/YouTube/);
assert.match(sourceProcessingError('youtube',{discoveryIntervalMinutes:1}),/15/);
assert.match(sourceProcessingError('youtube',{discoveryIntervalMinutes:Infinity}),/15/);
assert.match(sourceProcessingError('youtube',{descriptionMode:'invalid'}),/non valida/);
assert.match(sourceProcessingError('youtube',{youtubeLanguage:'it;unexpected'}),/non valida/);
console.log('PASS source modes, interval limits, description mode and language validation');

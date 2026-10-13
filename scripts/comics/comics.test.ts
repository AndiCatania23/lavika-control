import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareCard} from '../../src/lib/comics/storage';
import {episodeFields} from '../../src/lib/comics/schema';
const fields={series:1,episode_number:0,episode_date:'2026-08-23',title:'',caption:'',match_reference:'',status:'draft',asset_id:'628d27f1-5633-47e6-aa9c-716d709f103e'};
test('episode zero and optional metadata are accepted, dates and statuses validated',()=>{
 assert(episodeFields.safeParse(fields).success);
 for(const patch of [{episode_number:-1},{episode_number:0.5},{episode_date:'2026-02-30'},{status:'public'},{series:0},{title:'a'.repeat(161)},{image_url:'https://arbitrary.example/card'}])assert.equal(episodeFields.safeParse({...fields,...patch}).success,false);
});
test('original bytes are preserved and preview retains non-4:5 geometry',async()=>{
 const input=await sharp({create:{width:452,height:640,channels:3,background:'#d6cab7'}}).jpeg().toBuffer();
 const card=await prepareCard(input,1,0);
 assert.deepEqual(card.original,input);assert.equal(card.asset.width,452);assert.equal(card.asset.height,640);
 const preview=await sharp(card.preview).metadata();assert.equal(preview.width,452);assert.equal(preview.height,640);
 const replacement=await prepareCard(input,1,0);assert.notEqual(card.asset.original_key,replacement.asset.original_key);
 assert.match(card.asset.original_key,/^comics\/serie-01\/000\/[^/]+\/card.jpg$/);
});
test('rejects invalid images, size limit and unsafe path inputs',async()=>{
 await assert.rejects(()=>prepareCard(Buffer.from('<svg/>'),1,0));
 await assert.rejects(()=>prepareCard(Buffer.alloc(4*1024*1024+1),1,0));
 await assert.rejects(()=>prepareCard(Buffer.from('x'),1,-1));
});

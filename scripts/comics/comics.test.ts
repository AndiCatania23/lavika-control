import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareCard} from '../../src/lib/comics/storage';
import {episodeFields} from '../../src/lib/comics/schema';
const fields={series:1,episode_number:0,episode_date:'2026-08-23',title:'',caption:'',match_reference:'',character_ids:[],status:'draft',asset_id:'628d27f1-5633-47e6-aa9c-716d709f103e'};
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

test('character links accept multiple editorial selections and accept new catalog identities and reject malformed or duplicated ids',()=>{
 const tagged=episodeFields.parse({...fields,character_ids:['longo','pelligra']});
 assert.deepEqual(tagged.character_ids,['longo','pelligra']);
 assert(episodeFields.safeParse({...fields,character_ids:['pelligra','grella','varra','longo','new-player']}).success);
 for(const character_ids of [['../unknown'],['longo','longo'],[null],Array.from({length:101},(_,i)=>'id-'+i)])assert.equal(episodeFields.safeParse({...fields,character_ids}).success,false);
 assert.deepEqual(episodeFields.parse({...fields,character_ids:[]}).character_ids,[]);
});

test('catalog edits link canonical people and validate immutable artwork metadata',async()=>{
 const {characterMutation}=await import('../../src/lib/comics/characterSchema');
 const input={id:'new-player',revision:null,data:{player_id:'canonical-player-id',name:'Nuovo',role:'Giocatore',color:'#c92c36',image_url:'https://media.lavikasport.app/comics/personaggi/new-player/version/personaggio.webp',active:true,sort_order:4}};
 assert(characterMutation.safeParse(input).success);
 assert(characterMutation.safeParse({...input,data:{...input.data,player_id:null}}).success);
 for(const patch of [{name:''},{sort_order:-1},{color:'red'},{player_id:''}])assert.equal(characterMutation.safeParse({...input,data:{...input.data,...patch}}).success,false);
});

test('character upload preserves transparent original and rejects baked backgrounds',async()=>{
 const {prepareCharacter}=await import('../../src/lib/comics/characterStorage');
 const original=await sharp({create:{width:300,height:900,channels:4,background:{r:180,g:0,b:0,alpha:0.5}}}).png().toBuffer();
 const art=await prepareCharacter(original,'future-character');
 assert.deepEqual(art.original,original);assert.match(art.prefix,/^comics\/personaggi\/future-character\//);
 const meta=await sharp(art.preview).metadata();assert.equal(meta.height,640);assert(meta.hasAlpha);
 assert.notEqual((await prepareCharacter(original,'future-character')).prefix,art.prefix);
 const opaque=await sharp({create:{width:10,height:10,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer();
 await assert.rejects(()=>prepareCharacter(opaque,'future-character'));
 await assert.rejects(()=>prepareCharacter(original,'../bad'));
 await assert.rejects(()=>prepareCharacter(Buffer.alloc(4*1024*1024+1),'future-character'));
});

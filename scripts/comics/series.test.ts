import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSeries,recentEpisodes,nextEpisodeNumber,seriesInfo} from '../../src/lib/comics/series';
const match={id:'match',series:1,episode_number:9,episode_date:'2026-10-11'};
const satire={id:'satire',series:2,episode_number:1,episode_date:'2026-10-12'};
test('empty collections stay hidden and appear only with their first visible episode',()=>{
 assert.deepEqual(groupSeries([]),[]);
 assert.deepEqual(groupSeries([match]).map(s=>s.name),['Serie 01']);
 assert.deepEqual(groupSeries([match,satire]).map(s=>s.name),['Serie 01','I soliti noti']);
 assert.deepEqual(groupSeries([match]).map(s=>s.id),[1]);
});
test('mixed feed uses editorial date, never collection identity or independent episode number',()=>{
 assert.equal(recentEpisodes([match,satire])[0].id,'satire');
 const later={...match,id:'later',episode_date:'2026-10-13',episode_number:10};
 assert.equal(recentEpisodes([satire,later])[0].id,'later');
});
test('numbering is independent: I soliti noti starts at one, Serie 01 at zero',()=>{
 assert.equal(nextEpisodeNumber([match],2),1);
 assert.equal(nextEpisodeNumber([match,satire],2),2);
 assert.equal(nextEpisodeNumber([match,satire],1),10);
 const groups=groupSeries([{...match,episode_number:0},satire]);
 assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.episodes[0].episode_number),[0,1]);
 assert.equal(nextEpisodeNumber([],1),0);
 assert.equal(nextEpisodeNumber([{series:2,episode_number:0}],2),1);
});
test('new numbered series group without a new page and source array is not mutated',()=>{
 const cards=[match,{...match,id:'future',series:3,episode_number:1},satire];
 const before=JSON.stringify(cards);assert.equal(groupSeries(cards).length,3);
 recentEpisodes(cards);assert.equal(JSON.stringify(cards),before);assert.equal(seriesInfo(3).name,'Serie 03');
});

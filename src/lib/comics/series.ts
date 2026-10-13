// Shared editorial registry: keep identical in the beta and Control repositories.
// `series` is the existing storage identity, not a displayed sequence for named formats.
export const comicsSeries = [
 {id:1,name:'Serie 01',description:'La partita finisce. La vignetta comincia.',kicker:'DOPO IL FISCHIO',tone:'blue'},
 {id:2,name:'I soliti noti',description:'Il Catania, i suoi personaggi. Le solite storie, ogni volta diverse.',kicker:'LA COMMEDIA ROSSAZZURRA',tone:'red'},
] as const;
export function seriesInfo(id:number){return comicsSeries.find(s=>s.id===id)??{id,name:`Serie ${String(id).padStart(2,'0')}`,description:'Una nuova raccolta di storie da tifosi.',kicker:'DALLA COLLEZIONE',tone:'blue'};}
type EpisodeIdentity={id:string;series:number;episode_number:number;episode_date:string};
export function recentEpisodes<T extends EpisodeIdentity>(episodes:readonly T[]):T[]{return [...episodes].sort((a,b)=>b.episode_date.localeCompare(a.episode_date)||b.episode_number-a.episode_number||a.series-b.series||a.id.localeCompare(b.id));}
export function groupSeries<T extends EpisodeIdentity>(episodes:readonly T[]){
 const groups=new Map<number,T[]>();
 for(const episode of episodes){const group=groups.get(episode.series)??[];group.push(episode);groups.set(episode.series,group);}
 return [...groups].sort(([a],[b])=>a-b).map(([id,cards])=>({...seriesInfo(id),episodes:cards.sort((a,b)=>b.episode_number-a.episode_number||b.episode_date.localeCompare(a.episode_date))}));
}
export function firstEpisodeNumber(series:number){return series===2?1:0;}
export function nextEpisodeNumber(episodes:readonly {series:number;episode_number:number}[],series:number){return Math.max(firstEpisodeNumber(series)-1,...episodes.filter(e=>e.series===series).map(e=>e.episode_number))+1;}

export type ComicCharacter = {
 id:string; name:string; role:string; color:string; image_url:string;
 player_id:string|null; active:boolean; sort_order:number; revision:number;
 person?:{full_name:string;position:string|null}|null;
};

 'use client';
import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import {useAuth} from '@/lib/auth';
import {supabase} from '@/lib/supabaseClient';
import {unavailableComics, type ComicsInsights} from '@/lib/insights/comics';
const Context = createContext<ComicsInsights>(unavailableComics);
export const useComicsInsights = () => useContext(Context);
export function ComicsInsightsProvider({children}: {children: ReactNode}) {
 const {user,isAdmin} = useAuth();
 const [result,setResult] = useState<{owner:string; data:ComicsInsights} | null>(null);
 useEffect(() => {
  if (!user?.id || !isAdmin) return;
  const owner=user.id;
  const controller=new AbortController();
  void (async () => {
   try {
    const {data:{session}} = await supabase.auth.getSession();
    if (!session || controller.signal.aborted) return;
    const response=await fetch('/api/insights/comics', {headers:{Authorization:`Bearer ${session.access_token}`}, cache:'no-store',signal:controller.signal});
    const data=response.ok ? await response.json() as ComicsInsights : unavailableComics;
    if (!controller.signal.aborted) setResult({owner,data});
   } catch { if (!controller.signal.aborted) setResult({owner,data:unavailableComics}); }
  })();
  return () => controller.abort();
 },[user?.id,isAdmin]);
 const data=isAdmin && result?.owner===user?.id ? result!.data : unavailableComics;
 return <Context.Provider value={data}>{children}</Context.Provider>;
}

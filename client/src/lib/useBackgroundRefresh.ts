import type {Dispatch, SetStateAction, RefObject } from "react";
import { useEffect, useRef } from "react";
import { refreshAllCache } from "./api";

type SetBoolState = Dispatch<SetStateAction<boolean>>

const useLatestRef = <T>(func:T): RefObject<T> => {
  const funcRef = useRef(func);

  useEffect(() => {
    funcRef.current = func;
  });
  return funcRef;
}

export function useBackgroundRefresh (
  refreshItems: ()=>Promise<void>, 
  setRefreshPaused:SetBoolState, 
  setRefreshing:SetBoolState
) {  

  const latestRefreshItems = useLatestRef(refreshItems);

  // Silently refresh the video cache on every page visit
  useEffect(() => {
    async function backgroundRefresh() {
      try {
        const result = await refreshAllCache();
        setRefreshPaused(result.refreshPaused);
        await latestRefreshItems.current();
      } catch (err) {
        console.error("Background cache refresh failed:", err);
      } finally {
        setRefreshing(false);
      }
    }
    void backgroundRefresh();
    /* setRefreshPaused/setRefreshing are useState setters (React guarantees stable identity)
      and latestRefreshItems is a useRef ref (stable object identity): 
      none of these ever change between renders, so this effect is correctly run once */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

}

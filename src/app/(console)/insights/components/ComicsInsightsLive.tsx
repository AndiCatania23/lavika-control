'use client';
import {useComicsInsights} from './ComicsInsightsContext';
import {ComicsInsightsPanel} from './ComicsInsightsPanel';
export function ComicsInsightsLive(){return <ComicsInsightsPanel data={useComicsInsights()}/>;}

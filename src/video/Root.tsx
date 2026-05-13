import { Composition } from 'remotion';
import { MatchScorecard, matchScorecardSchema, defaultMatchScorecardProps } from './compositions/MatchScorecard';
import { PillStatVideo, pillStatVideoSchema, defaultPillStatVideoProps } from './compositions/PillStatVideo';
import { AIDirectedStoryVideo, aiDirectedStoryVideoSchema, defaultAIDirectedStoryVideoProps } from './compositions/AIDirectedStoryVideo';

/**
 * Root: registra tutte le compositions del progetto LAVIKA Social.
 * Aggiungere nuove compositions qui per renderle disponibili al CLI
 * remotion render + Player Composer.
 */
export const Root = () => {
  return (
    <>
      <Composition
        id="MatchScorecard"
        component={MatchScorecard}
        durationInFrames={240}        // 8s @ 30fps
        fps={30}
        width={1080}
        height={1350}                  // 4:5 IG/FB Feed
        schema={matchScorecardSchema}
        defaultProps={defaultMatchScorecardProps}
      />
      <Composition
        id="MatchScorecardStory"
        component={MatchScorecard}
        durationInFrames={240}        // 8s @ 30fps
        fps={30}
        width={1080}
        height={1920}                  // 9:16 IG/FB Story
        schema={matchScorecardSchema}
        defaultProps={defaultMatchScorecardProps}
      />
      <Composition
        id="PillStatVideo"
        component={PillStatVideo}
        durationInFrames={240}        // 8s @ 30fps
        fps={30}
        width={1080}
        height={1920}                  // 9:16 IG/FB Story
        schema={pillStatVideoSchema}
        defaultProps={defaultPillStatVideoProps}
      />
      <Composition
        id="AIDirectedStoryVideo"
        component={AIDirectedStoryVideo}
        durationInFrames={240}        // 8s @ 30fps (variabile: scenes sum)
        fps={30}
        width={1080}
        height={1920}                  // 9:16 IG/FB Story
        schema={aiDirectedStoryVideoSchema}
        defaultProps={defaultAIDirectedStoryVideoProps}
      />
    </>
  );
};

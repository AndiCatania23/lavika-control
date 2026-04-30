import { Composition } from 'remotion';
import { MatchScorecard, matchScorecardSchema, defaultMatchScorecardProps } from './compositions/MatchScorecard';

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
    </>
  );
};

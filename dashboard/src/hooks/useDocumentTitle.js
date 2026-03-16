import { useEffect } from 'react';

/**
 * Updates document.title based on WebSocket stage-change events.
 * @param {{ defaultTitle?: string, wsEvents?: Array }} options
 */
export default function useDocumentTitle({ defaultTitle = 'PBR Dashboard', wsEvents = [] } = {}) {
  useEffect(() => {
    const stageEvent = wsEvents.find((e) => e.type === 'stage-change');
    if (stageEvent && stageEvent.stage) {
      document.title = `PBR > ${stageEvent.stage}`;
    } else {
      document.title = defaultTitle;
    }
  }, [wsEvents, defaultTitle]);
}

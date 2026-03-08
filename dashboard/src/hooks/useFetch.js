import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';

/**
 * React hook for fetching data from the PBR API.
 *
 * @param {string|null} endpoint - API path to fetch (null to skip)
 * @returns {{ data: any, loading: boolean, error: Error|null, refetch: () => void }}
 */
export default function useFetch(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(() => {
    if (!endpoint) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    apiFetch(endpoint)
      .then((result) => {
        if (!mountedRef.current) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err);
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setLoading(false);
      });
  }, [endpoint]);

  useEffect(() => {
    mountedRef.current = true;
    refetch(); // eslint-disable-line react-hooks/set-state-in-effect -- data fetch on mount/endpoint change
    return () => {
      mountedRef.current = false;
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}

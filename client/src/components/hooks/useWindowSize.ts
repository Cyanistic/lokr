import { useState, useEffect } from "react";
import { useThrottledCallback } from "use-debounce";

export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });
  const throttledHandleResize = useThrottledCallback(handleResize, 100);

  // Handler to call on window resize
  function handleResize() {
    // Set window width/height to state
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  useEffect(() => {
    // Add event listener
    window.addEventListener("resize", throttledHandleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", throttledHandleResize);
  }, []); // Empty array ensures that effect is only run on mount and unmount

  return windowSize;
}

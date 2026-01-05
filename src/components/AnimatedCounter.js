import React, { useState, useEffect, useRef } from 'react';

const AnimatedCounter = ({ value, duration = 2000, decimals = 0, prefix = '', suffix = '' }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const valueRef = useRef(value);
  const startTimeRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    valueRef.current = value;
    startTimeRef.current = null;

    const animate = (currentTime) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = displayValue + (valueRef.current - displayValue) * easeOut;
      
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(valueRef.current);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration, displayValue]);

  const formattedValue = displayValue.toFixed(decimals);
  const parts = formattedValue.split('.');
  const integerPart = parseInt(parts[0]).toLocaleString();
  const decimalPart = parts[1] ? `.${parts[1]}` : '';

  return (
    <span>
      {prefix}{integerPart}{decimalPart}{suffix}
    </span>
  );
};

export default AnimatedCounter;


'use client';

import { useState, useEffect } from 'react';



// Format currency
export const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Format card number
export const formatCardNumber = (number: string) => {
  return number.replace(/(.{4})/g, '$1 ').trim();
};

// Generate random stock data for demo
export const generateStockData = () => {
  const points = [];
  let value = 24000;

  for (let i = 0; i < 5; i++) {
    value += (Math.random() - 0.5) * 5000;
    points.push(Math.max(value, 10000));
  }

  return points;
};

// Debounce function for search
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

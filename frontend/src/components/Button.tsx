import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'custom';
}

export default function Button({ children, variant = 'primary', className = '', ...props }: ButtonProps) {
  const baseStyle = "px-4 py-2 rounded-md font-medium transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center justify-center space-x-2";
  const variants = {
    primary: "bg-foreground text-background",
    outline: "border border-foreground bg-background text-foreground hover:bg-foreground hover:text-background",
    custom: ""
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

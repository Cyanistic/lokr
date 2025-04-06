import React, { createContext, useState, useContext, ReactNode } from 'react';

interface NavbarContextType {
  showNavbar: boolean;
  setShowNavbar: (show: boolean) => void;
}

const NavbarContext = createContext<NavbarContextType>({ 
  showNavbar: true, 
  setShowNavbar: () => {} 
});

export const useNavbar = () => useContext(NavbarContext);

export const NavbarProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [showNavbar, setShowNavbar] = useState<boolean>(true);

  return (
    <NavbarContext.Provider value={{ showNavbar, setShowNavbar }}>
      {children}
    </NavbarContext.Provider>
  );
};


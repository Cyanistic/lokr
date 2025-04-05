import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { API } from "../utils";
import { SessionUser as ApiSessionUser } from "../myApi";
import { importPublicKey } from "../cryptoFunctions";

export type SessionUser = ApiSessionUser & { importedPublicKey?: CryptoKey };

// Define the context type
interface ProfileContextType {
  profile: SessionUser | null;
  loading: boolean;
  refreshProfile: () => Promise<SessionUser | null>;
}

// Create the context with default values
const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: false,
  refreshProfile: async () => null,
});

// Props type for the provider
interface ProfileProviderProps {
  children: ReactNode;
}

export const ProfileProvider: React.FC<ProfileProviderProps> = ({
  children,
}) => {
  const [profile, setProfile] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch user profile
  const fetchProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await API.api.getLoggedInUser();
      if (!response.ok) {
        setProfile(null);
        return null;
      }

      const data = response.data as SessionUser;
      const importedPublicKey = await importPublicKey(data.publicKey);
      data.importedPublicKey = importedPublicKey!;
      setProfile(data);
      return data;
    } finally {
      setLoading(false);
    }
  };

  // Refresh profile function that can be called by children
  const refreshProfile = async () => {
    return fetchProfile();
  };

  // Get current location for tracking navigation
  const location = useLocation();

  // Fetch profile on initial mount and on route changes
  useEffect(() => {
    fetchProfile();
    // This will run on initial mount and whenever location changes (page navigation)
  }, [location.pathname]);

  // Value object to be provided to consumers
  const value = {
    profile,
    loading,
    error,
    refreshProfile,
  };

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
};

// Custom hook to use the profile context
export const useProfile = () => {
  const context = useContext(ProfileContext);

  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }

  return context;
};

export default ProfileProvider;

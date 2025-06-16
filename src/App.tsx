import React, { useState, useEffect, useContext, createContext, useCallback, useRef } from 'react';

// Import your custom CSS file
import './index.css';

// Import Lucide React icons for a modern UI
import {
    ShieldCheck, User, Lock, Eye, EyeOff, Activity, AlertCircle, Info,
    MessageSquareText, Loader2, LogOut, CheckCircle, Wifi, Database, Layers, Brain, GitFork, Book,
    Fingerprint, Zap, Globe, Cpu, ShieldAlert, Users, Bell, Code, Key, Settings, Handshake, DollarSign, CreditCard, ArrowRight
} from 'lucide-react';

// Import Stripe components for payment processing
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// --- API Base URL for Azure Functions ---
// IMPORTANT: This URL points to your deployed Azure Function App.
const API_BASE_URL = 'https://cybersecuritywebplatformnosqldb-func.azurewebsites.net/api';

// --- Stripe Publishable Key ---
// IMPORTANT: Replace with your actual Stripe Publishable Key (starts with pk_test_ or pk_live_)
// Never hardcode your Secret Key here!
const stripePromise = loadStripe('pk_live_51RaUoTP97sIKUnlYwkiDbTlEcXSiBtKeZ4ugC1gSma9RGgMsq5eQQfVlvdLRCrwIhjz6psoQ4amCar1n4Qa0WEQ00PwDpiEVX');

// --- Constants & Helper Functions ---
const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const MOCK_MFA_CODE = '123456'; // In a real app, this would be generated and sent via a secure channel

// Subscription levels and their corresponding features
const SUBSCRIPTION_PLANS = {
    'free': {
        name: 'Freemium',
        price: 'Free',
        features: [
            'Basic fraud detection (limited)',
            'Security alerts (limited)',
            'Scam education chatbot'
        ],
        allowedModules: ['overview', 'scam-prevention'] // Modules a free user can access
    },
    'standard': {
        name: 'Standard Plan',
        price: '$19.99/month',
        features: [
            'AI-driven fraud detection (standard)',
            'Real-time alerts',
            'Full scam education',
            'Threat intelligence overview'
        ],
        allowedModules: ['overview', 'fraud-detection', 'threat-intel', 'scam-prevention', 'innovative-designs']
    },
    'premium': {
        name: 'Premium Plan',
        price: '$49.99/month',
        features: [
            'Advanced AI automation',
            'API integrations',
            'Detailed threat monitoring',
            'Secure AI development framework access'
        ],
        allowedModules: ['overview', 'fraud-detection', 'threat-intel', 'scam-prevention', 'ai-dev-framework', 'innovative-designs']
    },
    'enterprise': {
        name: 'Enterprise Plan',
        price: 'Custom Pricing',
        features: [
            'Tailored security solutions',
            'Dedicated support',
            'On-premise integration options',
            'Advanced analytics & reporting'
        ],
        allowedModules: ['overview', 'fraud-detection', 'threat-intel', 'scam-prevention', 'ai-dev-framework', 'innovative-designs']
    }
};

// Context for Authentication and User State
const AuthContext = createContext(null);

// --- AuthProvider Component ---
// Manages authentication state (isLoggedIn, user, login/logout functions)
// Simulates Azure AD B2C authentication and interactions with Azure Functions for data.
const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState(null);
    const [authError, setAuthError] = useState('');
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [subscriptionLevel, setSubscriptionLevel] = useState('free');
    const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);

    // --- Mock API Calls to Azure Functions (Conceptual) ---
    // These functions simulate HTTP requests to your Azure Functions backend.
    // In a real scenario, you'd add headers for authentication (e.g., JWT token from Azure AD B2C).

    const fetchUserProfileApi = useCallback(async (uid) => {
        try {
            // This calls your Azure Function which then connects to Cosmos DB
            const response = await fetch(`${API_BASE_URL}/UserProfileApi?userId=${uid}`, {
                headers: {
                    'Content-Type': 'application/json',
                    // 'Authorization': `Bearer YOUR_AZURE_AD_B2C_TOKEN` // In real app
                }
            });
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`Profile for UID ${uid} not found. Backend should create default.`);
                    return null; // Indicates profile doesn't exist yet
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Error fetching user profile via API:", error);
            setAuthError("Failed to fetch user profile from backend.");
            return null;
        }
    }, []);

    const upsertUserProfileApi = useCallback(async (uid, profileData) => {
        try {
            // This calls your Azure Function which then connects to Cosmos DB
            const response = await fetch(`${API_BASE_URL}/UserProfileApi`, {
                method: 'POST', // Or PUT for updates
                headers: {
                    'Content-Type': 'application/json',
                    // 'Authorization': `Bearer YOUR_AZURE_AD_B2C_TOKEN`
                },
                body: JSON.stringify({ userId: uid, profileData: profileData })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error("Error upserting user profile via API:", error);
            setAuthError("Failed to save user profile to backend.");
            return null;
        }
    }, []);

    // Function to fetch or create user profile from the mocked backend
    const fetchOrCreateUserProfile = useCallback(async (uid) => {
        if (!uid) {
            console.error("UID missing. Cannot fetch/create profile.");
            return false;
        }

        let userData = await fetchUserProfileApi(uid);

        if (!userData) {
            // Map frontend fields to the desired Cosmos DB item fields
            const defaultProfile = {
                id: uid, // Cosmos DB document ID, ideally same as userId
                username: `user_${uid.substring(0, 8)}`,
                role: 'guest',
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toLocaleString(),
                behavioralBaseline: {
                    avgTypingSpeed: 150,
                    avgPasswordTypingSpeed: 100,
                    totalMouseDistance: 5000,
                    mouseClickCount: 20,
                },
                securityScore: {
                    score: 'Low Risk',
                    details: 'Initial assessment based on default baseline. No recent anomalies.'
                },
                subscription: 'free',
                // These map to your Cosmos DB item structure directly
                name: '', // Will be filled in ProfileSetupPage (maps to 'name' in Cosmos DB)
                email: '', // Maps to 'email' in Cosmos DB (can be username initially)
                date_of_birth: '', // Will be filled in ProfileSetupPage (maps to 'date_of_birth' in Cosmos DB)
                security_questions: [], // Will be filled in ProfileSetupPage (maps to 'security_questions' in Cosmos DB)
                loginMethod: 'email',
            };
            console.log(`Attempting to create new user profile for UID: ${uid} via API.`);
            const createResult = await upsertUserProfileApi(uid, defaultProfile);
            if (createResult) {
                userData = defaultProfile; // Use the default profile as the current state
                console.log("New user profile created via API:", userData);
            } else {
                return false; // Creation failed
            }
        }

        // Ensure securityScore is always an object with score and details
        const securityScoreData = userData.securityScore || { score: 'Low Risk', details: 'No recent anomalies.' };
        setSubscriptionLevel(userData.subscription || 'free');
        setUser({
            uid: userData.id || uid, // Use 'id' from Cosmos DB if available, else uid
            username: userData.username,
            role: userData.role,
            createdAt: userData.createdAt,
            lastLogin: userData.lastLogin,
            behavioralBaseline: userData.behavioralBaseline,
            securityScore: securityScoreData,
            subscription: userData.subscription,
            // Map Cosmos DB fields back to frontend-friendly names
            fullName: userData.name, // Map 'name' from Cosmos DB back to 'fullName' for frontend
            email: userData.email, // Map 'email' back to 'email'
            dob: userData.date_of_birth, // Map 'date_of_birth' back to 'dob'
            securityQuestions: userData.security_questions, // Map 'security_questions' back
            loginMethod: userData.loginMethod,
        });
        console.log("User profile fetched/ensured:", userData);
        // Check if essential profile fields are complete
        return !!(userData.name && userData.date_of_birth && userData.security_questions && userData.security_questions.length > 0);
    }, [fetchUserProfileApi, upsertUserProfileApi]);

    // Simulate initial authentication check (e.g., from a session cookie or mock token)
    useEffect(() => {
        const mockAuthCheck = async () => {
            setIsLoadingAuth(true);
            // Simulate a slight delay for network/auth check
            await new Promise(resolve => setTimeout(resolve, 500));

            let currentMockUserId = sessionStorage.getItem('mock_user_id');
            if (!currentMockUserId) {
                currentMockUserId = `mock_anon_${Date.now()}`;
                sessionStorage.setItem('mock_user_id', currentMockUserId);
            }

            setUserId(currentMockUserId);
            const profileComplete = await fetchOrCreateUserProfile(currentMockUserId);
            setIsLoggedIn(true); // Assume initial session is 'logged in' as anonymous or existing mock user
            setNeedsProfileCompletion(!profileComplete);
            setIsLoadingAuth(false);
            setIsAuthReady(true);
        };

        mockAuthCheck();
    }, [fetchOrCreateUserProfile]);


    // Mock login function simulating Azure AD B2C authentication
    const login = useCallback(async (usernameInput, passwordInput, mfaCodeInput, behavioralData, loginMethod = 'email') => {
        setIsLoadingAuth(true);
        setAuthError('');

        try {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

            if (usernameInput === 'admin@syncbridge.com' && passwordInput === 'SecurePass123!') {
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate MFA delay
                if (mfaCodeInput === MOCK_MFA_CODE) {
                    const authenticatedUid = `mock_admin_${Date.now()}`;
                    sessionStorage.setItem('mock_user_id', authenticatedUid); // Persist mock user

                    const newSecurityScore = detectMockFraud(behavioralData, user?.behavioralBaseline);

                    // Map frontend fields to desired Cosmos DB item fields
                    const updatedUserData = {
                        id: authenticatedUid, // Cosmos DB document ID
                        username: usernameInput, // Maps to 'username' in Cosmos DB
                        role: 'admin',
                        lastLogin: new Date().toLocaleString(),
                        behavioralBaseline: behavioralData,
                        securityScore: newSecurityScore,
                        subscription: 'premium', // Mock admin always premium
                        name: 'Mock Admin', // Maps to 'name' in Cosmos DB
                        email: usernameInput, // Maps to 'email' in Cosmos DB
                        date_of_birth: '1980-01-01', // Maps to 'date_of_birth' in Cosmos DB
                        security_questions: [{question: "What's your first pet's name?", answer: "Buddy"}], // Maps to 'security_questions' in Cosmos DB
                        loginMethod: loginMethod,
                    };

                    const upsertResult = await upsertUserProfileApi(authenticatedUid, updatedUserData);
                    if (!upsertResult) {
                         setAuthError("Failed to update user profile in backend after mock login.");
                         return { success: false, error: 'Backend update failed' };
                    }

                    setUser({
                        uid: authenticatedUid,
                        ...updatedUserData,
                        fullName: updatedUserData.name,
                        dob: updatedUserData.date_of_birth,
                        securityQuestions: updatedUserData.security_questions,
                    });
                    setUserId(authenticatedUid);
                    setSubscriptionLevel('premium');
                    setIsLoggedIn(true);
                    setNeedsProfileCompletion(false); // Mock admin user has complete profile
                    console.log("Mock login successful, profile updated via API.");
                    return { success: true };

                } else {
                    setAuthError('Invalid MFA code. Please try again.');
                    return { success: false, error: 'Invalid MFA code' };
                }
            } else {
                setAuthError('Invalid username or password.');
                return { success: false, error: 'Invalid credentials' };
            }
        } catch (error) {
            console.error('Login error:', error);
            setAuthError('An unexpected error occurred during login.');
            return { success: false, error: 'Unexpected error' };
        } finally {
            setIsLoadingAuth(false);
        }
    }, [user, upsertUserProfileApi]);

    // Mock signup function simulating Azure AD B2C signup
    const signup = useCallback(async (usernameInput, passwordInput, loginMethod = 'email') => {
        setIsLoadingAuth(true);
        setAuthError('');

        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

            const newMockUid = `mock_user_${Date.now()}`;
            sessionStorage.setItem('mock_user_id', newMockUid); // Persist mock user

            // Mapping frontend signup fields to desired Cosmos DB item fields
            const defaultProfile = {
                id: newMockUid, // Cosmos DB document ID, same as userId
                username: usernameInput, // Maps to 'username' in Cosmos DB
                role: 'new_user',
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toLocaleString(),
                behavioralBaseline: { avgTypingSpeed: 150, avgPasswordTypingSpeed: 100, totalMouseDistance: 5000, mouseClickCount: 20 },
                securityScore: { score: 'Low Risk', details: 'Initial assessment.' },
                subscription: 'free',
                name: '', // Will be filled in ProfileSetupPage (maps to 'name' in Cosmos DB)
                email: usernameInput, // Using username as email for consistency (maps to 'email' in Cosmos DB)
                date_of_birth: '', // Will be filled in ProfileSetupPage (maps to 'date_of_birth' in Cosmos DB)
                security_questions: [], // Will be filled in ProfileSetupPage (maps to 'security_questions' in Cosmos DB)
                loginMethod: loginMethod,
            };

            const upsertResult = await upsertUserProfileApi(newMockUid, defaultProfile);
            if (!upsertResult) {
                setAuthError("Failed to create user profile in backend after mock signup.");
                return { success: false, error: 'Backend creation failed' };
            }

            setUser({
                uid: newMockUid,
                ...defaultProfile,
                fullName: defaultProfile.name,
                dob: defaultProfile.date_of_birth,
                securityQuestions: defaultProfile.security_questions,
            });
            setUserId(newMockUid);
            setSubscriptionLevel('free');
            setIsLoggedIn(true);
            setNeedsProfileCompletion(true); // New users always need to complete profile
            console.log("Mock signup successful, profile created via API.");
            return { success: true };
        } catch (error) {
            console.error('Signup error:', error);
            setAuthError('An unexpected error occurred during signup.');
            return { success: false, error: 'Unexpected error' };
        } finally {
            setIsLoadingAuth(false);
        }
    }, [upsertUserProfileApi]);

    // Function to update user profile details
    const updateProfileDetails = useCallback(async (fullName, dob, securityQuestions) => {
        if (!userId) {
            setAuthError("No user logged in to update profile.");
            return false;
        }
        setIsLoadingAuth(true);
        setAuthError('');
        try {
            // Mapping frontend fields to desired Cosmos DB item fields for update
            const updatedDataForCosmosDB = {
                id: userId, // Ensure 'id' matches 'userId' for the partition key
                name: fullName, // Map fullName to 'name' in Cosmos DB
                date_of_birth: dob, // Map dob to 'date_of_birth' in Cosmos DB
                security_questions: securityQuestions, // Map securityQuestions to 'security_questions' in Cosmos DB
                lastProfileUpdate: new Date().toISOString(),
            };
            
            // Merge with existing user data to maintain other fields like username, role, subscription etc.
            const existingUserForMerge = user || {};
            const updatedUserObjectForCosmosDB = { ...existingUserForMerge, ...updatedDataForCosmosDB };

            console.log(`Attempting to update profile details for UID: ${userId} via API.`);
            // Send the merged, Cosmos DB-friendly object to the backend
            const updateResult = await upsertUserProfileApi(userId, updatedUserObjectForCosmosDB);

            if (updateResult) {
                // Update local React state with the frontend-friendly field names
                setUser(prevUser => ({
                    ...prevUser,
                    fullName: fullName,
                    dob: dob,
                    securityQuestions: securityQuestions,
                    lastProfileUpdate: new Date().toISOString(),
                }));
                setNeedsProfileCompletion(false); // Profile is now complete
                console.log("User profile details updated successfully via API.");
                return true;
            } else {
                setAuthError("Failed to update profile details in backend.");
                return false;
            }
        } catch (error) {
            console.error("Error updating profile details:", error);
            setAuthError("Failed to update profile details.");
            return false;
        } finally {
            setIsLoadingAuth(false);
        }
    }, [userId, user, upsertUserProfileApi]);

    // Mock logout function
    const logout = useCallback(async () => {
        setIsLoadingAuth(true);
        setAuthError('');
        try {
            // Simulate clearing session/token in Azure AD B2C
            sessionStorage.removeItem('mock_user_id'); // Clear mock user from session
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate logout delay

            setIsLoggedIn(false);
            setUser(null);
            setUserId(null);
            setSubscriptionLevel('free');
            setNeedsProfileCompletion(false);
            console.log("Logged out successfully.");
        } catch (error) {
            console.error("Logout failed:", error);
            setAuthError("Failed to log out.");
        } finally {
            setIsLoadingAuth(false);
        }
    }, []);

    const updateSubscription = useCallback(async (newLevel) => {
        if (!userId) return;
        setIsLoadingAuth(true);
        setAuthError('');

        try {
            // Include 'id' for Cosmos DB consistency when updating
            const updatedDataForCosmosDB = {
                ...user, // Maintain existing user data
                id: userId, // Ensure 'id' is present and correct
                subscription: newLevel,
            };
            console.log(`Attempting to update subscription for UID: ${userId} to ${newLevel} via API.`);
            const updateResult = await upsertUserProfileApi(userId, updatedDataForCosmosDB);

            if (updateResult) {
                setSubscriptionLevel(newLevel);
                setUser(prevUser => ({
                    ...prevUser,
                    subscription: newLevel,
                }));
                console.log(`Subscription updated to: ${newLevel} via API.`);
            } else {
                setAuthError("Failed to update subscription level in backend.");
            }
        } catch (error) {
            console.error("Error updating subscription:", error);
            setAuthError("Failed to update subscription level.");
        } finally {
            setIsLoadingAuth(false);
        }
    }, [userId, user, upsertUserProfileApi]);


    const contextValue = {
        isLoggedIn,
        user,
        authError,
        isLoadingAuth,
        userId,
        subscriptionLevel,
        needsProfileCompletion,
        login,
        logout,
        signup,
        updateSubscription,
        updateProfileDetails,
        isAuthReady,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use authentication context
const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// --- Behavioral Biometrics Simulation ---
const useBehavioralBiometrics = () => {
    const [typingSpeed, setTypingSpeed] = useState([]);
    const [mouseMovement, setMouseMovement] = useState({ x: 0, y: 0, count: 0, distance: 0 });
    const [passwordInputTimes, setPasswordInputTimes] = useState([]);
    const lastKeyPressTime = useRef(0);
    const lastMouseMovePosition = useRef({ x: 0, y: 0 });

    const handleKeyPress = useCallback((e) => {
        const currentTime = Date.now();
        if (lastKeyPressTime.current !== 0) {
            const timeDiff = currentTime - lastKeyPressTime.current;
            setTypingSpeed(prev => [...prev, timeDiff]);
        }
        lastKeyPressTime.current = currentTime;
    }, []);

    const handlePasswordKeyPress = useCallback((e) => {
        const currentTime = Date.now();
        setPasswordInputTimes(prev => [...prev, currentTime]);
    }, []);

    const handleMouseMove = useCallback((e) => {
        const currentX = e.clientX;
        const currentY = e.clientY;
        const lastX = lastMouseMovePosition.current.x;
        const lastY = lastMouseMovePosition.current.y;

        let distance = 0;
        if (lastX !== 0 || lastY !== 0) {
            distance = Math.sqrt(Math.pow(currentX - lastX, 2) + Math.pow(currentY - lastY, 2));
        }

        setMouseMovement(prev => ({
            x: currentX,
            y: currentY,
            count: prev.count + 1,
            distance: prev.distance + distance
        }));
        lastMouseMovePosition.current = { x: currentX, y: currentY };
    }, []);

    const resetBehavioralData = useCallback(() => {
        setTypingSpeed([]);
        setMouseMovement({ x: 0, y: 0, count: 0, distance: 0 });
        setPasswordInputTimes([]);
        lastKeyPressTime.current = 0;
        lastMouseMovePosition.current = 0; // Resetting to 0
    }, []);

    const getBehavioralScore = useCallback(() => {
        const avgTypingSpeed = typingSpeed.length > 0
            ? typingSpeed.reduce((sum, val) => sum + val, 0) / typingSpeed.length
            : 0;

        let avgPasswordTypingSpeed = 0;
        if (passwordInputTimes.length > 1) {
            const diffs = [];
            for (let i = 1; i < passwordInputTimes.length; i++) {
                diffs.push(passwordInputTimes[i] - passwordInputTimes[i-1]);
            }
            avgPasswordTypingSpeed = diffs.reduce((sum, val) => sum + val, 0) / diffs.length;
        }

        const totalMouseDistance = mouseMovement.distance;
        const mouseClickCount = mouseMovement.count;

        return {
            avgTypingSpeed: parseFloat(avgTypingSpeed.toFixed(2)),
            avgPasswordTypingSpeed: parseFloat(avgPasswordTypingSpeed.toFixed(2)),
            totalMouseDistance: parseFloat(totalMouseDistance.toFixed(2)),
            mouseClickCount: mouseClickCount,
        };
    }, [typingSpeed, mouseMovement, passwordInputTimes]);

    return {
        handleKeyPress,
        handlePasswordKeyPress,
        handleMouseMove,
        resetBehavioralData,
        getBehavioralScore,
    };
};

// --- Mock AI Fraud Detection Logic ---
const detectMockFraud = (currentBehavioralData, userBaseline) => {
    const baseline = userBaseline || {
        avgTypingSpeed: 150,
        avgPasswordTypingSpeed: 100,
        totalMouseDistance: 5000,
        mouseClickCount: 20,
    };

    let riskFactors = 0;
    let anomalyDetails = [];

    if (currentBehavioralData.avgTypingSpeed > 0) {
        if (currentBehavioralData.avgTypingSpeed < baseline.avgTypingSpeed * 0.7) {
            riskFactors++;
            anomalyDetails.push("Typing speed significantly faster than usual.");
        } else if (currentBehavioralData.avgTypingSpeed > baseline.avgTypingSpeed * 1.5) {
            riskFactors++;
            anomalyDetails.push("Typing speed significantly slower than usual.");
        }
    }

    if (currentBehavioralData.avgPasswordTypingSpeed > 0) {
        if (currentBehavioralData.avgPasswordTypingSpeed < baseline.avgPasswordTypingSpeed * 0.7) {
            riskFactors++;
            anomalyDetails.push("Password typing speed faster than baseline.");
        } else if (currentBehavioralData.avgPasswordTypingSpeed > baseline.avgPasswordTypingSpeed * 1.5) {
            riskFactors++;
            anomalyDetails.push("Password typing speed slower than baseline.");
        }
    }

    if (currentBehavioralData.totalMouseDistance > baseline.totalMouseDistance * 2) {
        riskFactors++;
        anomalyDetails.push("Excessive mouse movement detected.");
    }
    if (currentBehavioralData.mouseClickCount < baseline.mouseClickCount * 0.5) {
        riskFactors++;
        anomalyDetails.push("Too few mouse interactions (potential automation).");
    }

    let score = 'Low Risk';
    if (riskFactors >= 3) {
        score = 'High Risk';
    } else if (riskFactors >= 1) {
        score = 'Medium Risk';
    }

    return {
        score,
        details: anomalyDetails.length > 0 ? anomalyDetails.join('. ') : 'No significant behavioral anomalies detected.'
    };
};


// --- AI Chatbot for Scam Education (Gemini API Integration) ---
const AIChatbot = ({ prompt }) => {
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const generateResponse = useCallback(async () => {
        if (!prompt) {
            setError("Please provide a prompt for the AI chatbot.");
            return;
        }

        setLoading(true);
        setError('');
        setResponse('');

        try {
            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
            const apiKey = ""; // Canvas will automatically provide the API key
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error.message || 'Failed to fetch AI response.');
            }

            const result = await res.json();
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                setResponse(result.candidates[0].content.parts[0].text);
            } else {
                setResponse("No response from AI, or unexpected format.");
            }
        } catch (err) {
            console.error("AI Chatbot Error:", err);
            setError(`Failed to get AI response: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [prompt]);

    useEffect(() => {
        // Automatically generate response when prompt changes, or on component mount if prompt exists
        if (prompt) {
            generateResponse();
        }
    }, [prompt, generateResponse]);

    if (loading) return <div className="ai-chatbot-loading"><Loader2 className="spinner" size={20} /> Generating AI Insight...</div>;
    if (error) return <div className="ai-chatbot-error"><AlertCircle className="icon" size={20} /> Error: {error}</div>;
    if (!response) return <div className="ai-chatbot-waiting">Awaiting AI insights...</div>;

    return (
        <div className="ai-chatbot-response">
            <h4 className="ai-chatbot-title"><MessageSquareText className="icon" size={20} />AI Insight:</h4>
            <p className="ai-chatbot-text">{response}</p>
        </div>
    );
};


// --- Welcome Page Component ---
const WelcomePage = ({ navigateToGetStarted }) => {
    return (
        <div className="welcome-page">
            <div className="welcome-card">
                <ShieldCheck className="welcome-icon" />
                <h1 className="welcome-title">Welcome to SyncBridge Technologies</h1>
                <p className="welcome-subtitle">
                    America's most trusted security company, saving thousands of seniors every day from online threats and scams.
                </p>
                <button
                    onClick={navigateToGetStarted}
                    className="welcome-button"
                >
                    Get Started <ArrowRight className="arrow-icon" size={24} />
                </button>
            </div>
        </div>
    );
};

// --- Get Started Page Component ---
const GetStartedPage = ({ navigateToLoginSignupChoice }) => {
    return (
        <div className="get-started-page">
            <div className="get-started-card">
                <Layers className="get-started-icon" />
                <h2 className="get-started-title">Your Journey to Security Begins Here</h2>
                <p className="get-started-subtitle">
                    We're committed to protecting your digital life. Let's set up your secure access.
                </p>
                <button
                    onClick={navigateToLoginSignupChoice}
                    className="get-started-button"
                >
                    Continue <ArrowRight className="arrow-icon" size={24} />
                </button>
            </div>
        </div>
    );
};


// --- Login/Signup Choice Component ---
const LoginSignupChoice = ({ navigateToLogin, navigateToSignup, simulateSocialLogin }) => {
    const { isAuthReady } = useAuth();

    return (
        <div className="login-signup-choice-page">
            <div className="login-signup-choice-card">
                <h2 className="login-signup-choice-title">How would you like to proceed?</h2>

                <div className="login-signup-choice-buttons">
                    <button
                        onClick={navigateToLogin}
                        className="btn-primary"
                        disabled={!isAuthReady}
                    >
                        <User className="icon-margin-right" size={20} /> Log In with Email
                    </button>
                    <button
                        onClick={navigateToSignup}
                        className="btn-secondary"
                        disabled={!isAuthReady}
                    >
                        <Lock className="icon-margin-right" size={20} /> Sign Up with Email
                    </button>

                    <div className="separator">
                        <span className="separator-text">Or continue with</span>
                    </div>

                    <button
                        onClick={() => simulateSocialLogin('Google')}
                        className="btn-social"
                        disabled={!isAuthReady}
                    >
                        <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google" className="icon-margin-right" />
                        Login with Google (Mock)
                    </button>
                    <button
                        onClick={() => simulateSocialLogin('GitHub')}
                        className="btn-social"
                        disabled={!isAuthReady}
                    >
                        <img src="https://img.icons8.com/ios-filled/24/000000/github.png" alt="GitHub" className="icon-margin-right" />
                        Login with GitHub (Mock)
                    </button>
                </div>
                <p className="login-signup-choice-note">
                    Social login integrations are for demonstration. Actual integration would use OAuth flows.
                </p>
            </div>
        </div>
    );
};


// --- Login Component ---
const Login = ({ navigateToSignup, navigateAfterLogin }) => {
    const { login, authError, isLoadingAuth, isAuthReady } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [mfaVisible, setMfaVisible] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState('');

    const { handleKeyPress, handlePasswordKeyPress, handleMouseMove, resetBehavioralData, getBehavioralScore } = useBehavioralBiometrics();

    useEffect(() => {
        if (isAuthReady) {
            resetBehavioralData();
            setMfaVisible(false);
            setMfaCode('');
            setLocalError('');
        }
    }, [resetBehavioralData, authError, isAuthReady]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (!username || !password) {
            setLocalError('Username and password are required.');
            return;
        }
        if (username.length < MIN_USERNAME_LENGTH) {
            setLocalError(`Username must be at least ${MIN_USERNAME_LENGTH} characters.`);
            return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            setLocalError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        const behavioralData = getBehavioralScore();
        console.log('Collected Behavioral Data (Pre-Login):', behavioralData);

        if (!mfaVisible) {
            setMfaVisible(true);
            return;
        }

        const result = await login(username, password, mfaCode, behavioralData, 'email');
        if (!result.success) {
            setMfaVisible(false);
            setMfaCode('');
            resetBehavioralData();
        }
    };

    if (isLoadingAuth || !isAuthReady) {
        return (
            <div className="loading-page">
                <div className="loading-content">
                    <Loader2 className="spinner" />
                    <p className="loading-text">Loading authentication services...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div
                className="login-card"
                onMouseMove={handleMouseMove}
            >
                <div className="login-header">
                    <ShieldCheck className="login-icon" />
                    <h2 className="login-title">SyncBridge Security Platform</h2>
                    <p className="login-subtitle">Secure Access to Your Digital Assets</p>
                </div>
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="username" className="form-label">
                            Email Address
                        </label>
                        <div className="input-group">
                            <div className="input-icon">
                                <User className="icon" aria-hidden="true" />
                            </div>
                            <input
                                id="username"
                                name="username"
                                type="email"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={handleKeyPress}
                                className="form-input"
                                placeholder="you@example.com"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">
                            Password
                        </label>
                        <div className="input-group">
                            <div className="input-icon">
                                <Lock className="icon" aria-hidden="true" />
                            </div>
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={handlePasswordKeyPress}
                                className="form-input password-input"
                                placeholder="Your Secure Password"
                                disabled={isLoadingAuth}
                            />
                            <div
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? (
                                    <EyeOff className="icon" />
                                ) : (
                                    <Eye className="icon" />
                                )}
                            </div>
                        </div>
                    </div>

                    {mfaVisible && (
                        <div className="form-group">
                            <label htmlFor="mfaCode" className="form-label">
                                MFA Code (e.g., {MOCK_MFA_CODE})
                            </label>
                            <div className="input-group">
                                <div className="input-icon">
                                    <Lock className="icon" aria-hidden="true" />
                                </div>
                                <input
                                    id="mfaCode"
                                    name="mfaCode"
                                    type="text"
                                    required
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    className="form-input"
                                    placeholder="Enter 6-digit code"
                                    maxLength="6"
                                    disabled={isLoadingAuth}
                                />
                            </div>
                            <p className="mfa-note">
                                This simulates a code sent to your registered device.
                            </p>
                        </div>
                    )}

                    {(localError || authError) && (
                        <div className="error-message">
                            <AlertCircle className="icon-margin-right" size={16} />
                            {localError || authError}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="btn-primary-large"
                            disabled={isLoadingAuth}
                        >
                            {isLoadingAuth ? (
                                <Loader2 className="spinner icon-margin-right" size={20} />
                            ) : mfaVisible ? (
                                'Verify MFA & Log In'
                            ) : (
                                'Log In'
                            )}
                        </button>
                    </div>
                </form>
                <div className="login-footer">
                    <p>For demonstration, use:</p>
                    <p className="font-semibold">Username: admin@syncbridge.com</p>
                    <p className="font-semibold">Password: SecurePass123!</p>
                    {mfaVisible && <p className="font-semibold">MFA Code: {MOCK_MFA_CODE}</p>}
                    <p className="mt-4">
                        Don't have an account?{' '}
                        <button onClick={navigateToSignup} className="link-button">
                            Sign Up
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Signup Component ---
const Signup = ({ navigateToLogin, navigateAfterSignup }) => {
    const { signup, isLoadingAuth, authError } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [localError, setLocalError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (!username || !password || !confirmPassword) {
            setLocalError('All fields are required.');
            return;
        }
        if (username.length < MIN_USERNAME_LENGTH) {
            setLocalError(`Username must be at least ${MIN_USERNAME_LENGTH} characters.`);
            return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            setLocalError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (password !== confirmPassword) {
            setLocalError('Passwords do not match.');
            return;
        }

        const result = await signup(username, password, 'email');
        if (result.success) {
            navigateAfterSignup();
        }
    };

    return (
        <div className="signup-page">
            <div className="signup-card">
                <div className="signup-header">
                    <ShieldCheck className="signup-icon" />
                    <h2 className="signup-title">Sign Up for SyncBridge</h2>
                    <p className="signup-subtitle">Create your account to get started</p>
                </div>
                <form onSubmit={handleSubmit} className="signup-form">
                    <div className="form-group">
                        <label htmlFor="signup-username" className="form-label">
                            Email Address
                        </label>
                        <div className="input-group">
                            <div className="input-icon">
                                <User className="icon" />
                            </div>
                            <input
                                id="signup-username"
                                name="username"
                                type="email"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="form-input"
                                placeholder="you@example.com"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="signup-password" className="form-label">
                            Password
                        </label>
                        <div className="input-group">
                            <div className="input-icon">
                                <Lock className="icon" />
                            </div>
                            <input
                                id="signup-password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="form-input"
                                placeholder="Create a secure password"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirm-password" className="form-label">
                            Confirm Password
                        </label>
                        <div className="input-group">
                            <div className="input-icon">
                                <Lock className="icon" />
                            </div>
                            <input
                                id="confirm-password"
                                name="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="form-input"
                                placeholder="Confirm your password"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>

                    {(localError || authError) && (
                        <div className="error-message">
                            <AlertCircle className="icon-margin-right" size={16} />
                            {localError || authError}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="btn-primary-large"
                            disabled={isLoadingAuth}
                        >
                            {isLoadingAuth ? (
                                <Loader2 className="spinner icon-margin-right" size={20} />
                            ) : (
                                'Sign Up'
                            )}
                        </button>
                    </div>
                </form>
                <div className="signup-footer">
                    <p>
                        Already have an account?{' '}
                        <button onClick={navigateToLogin} className="link-button">
                            Log In
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Profile Setup Page Component ---
const ProfileSetupPage = ({ navigateToPricing }) => {
    const { user, updateProfileDetails, isLoadingAuth, authError } = useAuth();
    const [fullName, setFullName] = useState(user?.fullName || '');
    const [dob, setDob] = useState(user?.dob || '');
    const [securityQuestion1, setSecurityQuestion1] = useState(user?.securityQuestions?.[0]?.question || '');
    const [securityAnswer1, setSecurityAnswer1] = useState(user?.securityQuestions?.[0]?.answer || '');
    const [securityQuestion2, setSecurityQuestion2] = useState(user?.securityQuestions?.[1]?.question || '');
    const [securityAnswer2, setSecurityAnswer2] = useState(user?.securityQuestions?.[1]?.answer || '');
    const [localError, setLocalError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (!fullName || !dob || !securityQuestion1 || !securityAnswer1 || !securityQuestion2 || !securityAnswer2) {
            setLocalError('All fields, including security questions, are required.');
            return;
        }

        const securityQuestions = [
            { question: securityQuestion1, answer: securityAnswer1 },
            { question: securityQuestion2, answer: securityAnswer2 },
        ];

        const success = await updateProfileDetails(fullName, dob, securityQuestions);
        if (success) {
            navigateToPricing();
        }
    };

    return (
        <div className="profile-setup-page">
            <div className="profile-setup-card">
                <div className="profile-setup-header">
                    <User className="profile-setup-icon" />
                    <h2 className="profile-setup-title">Complete Your Profile</h2>
                    <p className="profile-setup-subtitle">Help us secure your account with additional details.</p>
                </div>
                <form onSubmit={handleSubmit} className="profile-setup-form">
                    <div className="form-group">
                        <label htmlFor="full-name" className="form-label">
                            Full Name
                        </label>
                        <input
                            id="full-name"
                            name="full-name"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="form-input"
                            disabled={isLoadingAuth}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="dob" className="form-label">
                            Date of Birth
                        </label>
                        <input
                            id="dob"
                            name="dob"
                            type="date"
                            required
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className="form-input"
                            disabled={isLoadingAuth}
                        />
                    </div>
                    <div className="security-questions-section">
                        <p className="security-questions-title">Security Questions:</p>
                        <div className="form-group">
                            <label htmlFor="sq1" className="form-label">
                                Question 1
                            </label>
                            <input
                                id="sq1"
                                type="text"
                                required
                                value={securityQuestion1}
                                onChange={(e) => setSecurityQuestion1(e.target.value)}
                                className="form-input"
                                placeholder="e.g., What was your first pet's name?"
                                disabled={isLoadingAuth}
                            />
                            <label htmlFor="sa1" className="form-label mt-2">
                                Answer 1
                            </label>
                            <input
                                id="sa1"
                                type="text"
                                required
                                value={securityAnswer1}
                                onChange={(e) => setSecurityAnswer1(e.target.value)}
                                className="form-input"
                                disabled={isLoadingAuth}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sq2" className="form-label">
                                Question 2
                            </label>
                            <input
                                id="sq2"
                                type="text"
                                required
                                value={securityQuestion2}
                                onChange={(e) => setSecurityQuestion2(e.target.value)}
                                className="form-input"
                                placeholder="e.g., What city were you born in?"
                                disabled={isLoadingAuth}
                            />
                            <label htmlFor="sa2" className="form-label mt-2">
                                Answer 2
                            </label>
                            <input
                                id="sa2"
                                type="text"
                                required
                                value={securityAnswer2}
                                onChange={(e) => setSecurityAnswer2(e.target.value)}
                                className="form-input"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>

                    {(localError || authError) && (
                        <div className="error-message">
                            <AlertCircle className="icon-margin-right" size={16} />
                            {localError || authError}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="btn-primary-large"
                            disabled={isLoadingAuth}
                        >
                            {isLoadingAuth ? (
                                <Loader2 className="spinner icon-margin-right" size={20} />
                            ) : (
                                'Save Profile & Continue'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Pricing Model Component ---
const PricingModel = ({ navigateToPayment, navigateToDashboard }) => {
    const { subscriptionLevel } = useAuth();

    return (
        <div className="pricing-page">
            <div className="pricing-header">
                <h2 className="pricing-title">Choose Your Security Plan</h2>
                <p className="pricing-subtitle">Select the SyncBridge plan that best fits your needs.</p>
            </div>

            <div className="pricing-grid">
                {Object.keys(SUBSCRIPTION_PLANS).map((key) => {
                    const plan = SUBSCRIPTION_PLANS[key];
                    const isCurrentPlan = subscriptionLevel === key;
                    const isEnterprise = key === 'enterprise';

                    return (
                        <div
                            key={key}
                            className={`pricing-card ${isCurrentPlan ? 'pricing-card-current' : ''}`}
                        >
                            <h3 className="pricing-card-title">{plan.name}</h3>
                            <p className="pricing-card-price">
                                {plan.price}
                                {!isEnterprise && <span className="pricing-card-price-unit">/month</span>}
                            </p>
                            <ul className="pricing-card-features">
                                {plan.features.map((feature, index) => (
                                    <li key={index} className="feature-item">
                                        <CheckCircle className="feature-icon" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <div className="pricing-card-actions">
                                {isCurrentPlan && key === 'free' ? (
                                    <button
                                        onClick={navigateToDashboard}
                                        className="btn-green"
                                    >
                                        Proceed with Free Plan
                                    </button>
                                ) : isCurrentPlan ? (
                                    <button
                                        className="btn-disabled"
                                        disabled
                                    >
                                        Current Plan
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => navigateToPayment(key)}
                                        className="btn-primary"
                                    >
                                        {isEnterprise ? 'Contact Sales' : 'Choose Plan'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="pricing-note">
                Our AI-Powered Dynamic Pricing adjusts based on market demand and customer behavior to optimize value.
            </p>
        </div>
    );
};

// --- CheckoutForm Component ---
// This component handles the actual Stripe card element and submission
const CheckoutForm = ({ selectedPlan, navigateToDashboard }) => {
    const stripe = useStripe();
    const elements = useElements();
    const { user, userId, updateSubscription } = useAuth(); // Get user details from AuthContext
    const [clientSecret, setClientSecret] = useState('');
    const [paymentProcessing, setPaymentProcessing] = useState(false);
    const [paymentMessage, setPaymentMessage] = useState('');

    const planPrice = SUBSCRIPTION_PLANS[selectedPlan]?.price; // e.g., "$19.99/month"

    // Fetch client secret from your Azure Function when component mounts
    useEffect(() => {
        const fetchClientSecret = async () => {
            setPaymentMessage(''); // Clear any previous messages
            setPaymentProcessing(true); // Indicate loading

            // Extract numeric price from planPrice string (e.g., "$19.99/month" -> 1999 cents)
            const priceString = planPrice?.replace(/[^\d.]/g, ''); // Remove all non-numeric, non-dot characters
            const amountInCents = priceString ? Math.round(parseFloat(priceString) * 100) : 0;
            
            if (amountInCents <= 0) {
                setPaymentMessage('Invalid plan price for payment.');
                setPaymentProcessing(false);
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/CreatePaymentIntent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: amountInCents, // Amount in cents
                        currency: 'usd',
                        planId: selectedPlan,
                        userId: userId, // Pass user ID to backend for PaymentIntent metadata
                        receipt_email: user?.username || user?.email || undefined, // Use user's email for receipt
                    }),
                });
                const data = await response.json();
                if (data.clientSecret) {
                    setClientSecret(data.clientSecret);
                    setPaymentProcessing(false);
                } else {
                    setPaymentMessage(data.error || 'Failed to initialize payment.');
                    setPaymentProcessing(false);
                }
            } catch (error) {
                console.error("Error creating PaymentIntent:", error);
                setPaymentMessage('Error initiating payment process.');
                setPaymentProcessing(false);
            }
        };

        if (selectedPlan && planPrice !== 'Free' && planPrice !== 'Custom Pricing') {
            fetchClientSecret();
        } else if (selectedPlan && (planPrice === 'Free' || planPrice === 'Custom Pricing')) {
            // Handle free plan or custom pricing scenario directly
            setPaymentMessage('No payment required for this plan. Proceed to Dashboard.');
            setPaymentProcessing(false);
        }
    }, [selectedPlan, userId, user?.username, user?.email, planPrice]);


    const handleSubmit = async (event) => {
        event.preventDefault();
        setPaymentProcessing(true);
        setPaymentMessage('');

        if (!stripe || !elements || !clientSecret) {
            // Stripe.js has not yet loaded.
            setPaymentMessage('Payment service not ready. Please try again.');
            setPaymentProcessing(false);
            return;
        }

        // Confirm the payment with the card details
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: elements.getElement(CardElement),
                billing_details: {
                    // You might collect more billing details in a real form
                    name: user?.fullName || user?.username, // Use user's full name or username
                    email: user?.username || user?.email,
                },
            },
        });

        if (error) {
            console.error('[Stripe error]', error);
            setPaymentMessage(error.message || 'Payment failed.');
            setPaymentProcessing(false);
        } else {
            // Payment succeeded or is processing (e.g., 3D Secure required)
            // The Stripe webhook will ultimately update the subscription status in your backend
            console.log('[PaymentIntent]', paymentIntent);
            setPaymentMessage('Payment successful! Your subscription will be updated shortly.');
            // Optionally, update frontend subscription state optimistically or wait for webhook confirmation
            // The webhook is the source of truth, but for UX, you can navigate.
            
            // Note: The actual subscription update in Cosmos DB will be handled by StripeWebhookHandler.
            // For now, we'll optimistically update the frontend state and navigate.
            await updateSubscription(selectedPlan); // Optimistically update local state

            setTimeout(() => {
                navigateToDashboard();
            }, 1500);
        }
    };

    // Styling for CardElement
    const CARD_ELEMENT_OPTIONS = {
        style: {
            base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                    color: '#aab7c4',
                },
            },
            invalid: {
                color: '#9e2146',
            },
        },
    };

    return (
        <form onSubmit={handleSubmit} className="payment-form">
            <div className="form-group mb-6">
                <label htmlFor="card-element" className="form-label mb-2">
                    Credit Card Details
                </label>
                <div className="stripe-card-element-container">
                    <CardElement options={CARD_ELEMENT_OPTIONS} id="card-element" />
                </div>
            </div>

            {(planPrice === 'Free' || planPrice === 'Custom Pricing') ? (
                 <button
                    type="button" // Change to type="button" if no actual Stripe payment is made
                    onClick={() => navigateToDashboard()}
                    className="btn-green-large"
                    disabled={paymentProcessing}
                 >
                    Proceed to Dashboard
                 </button>
            ) : (
                <button
                    type="submit"
                    className="btn-green-large"
                    disabled={!stripe || !elements || paymentProcessing || !clientSecret}
                >
                    {paymentProcessing ? (
                        <Loader2 className="spinner icon-margin-right" size={20} />
                    ) : (
                        <><DollarSign className="icon-margin-right" size={20} /> Pay {planPrice}</>
                    )}
                </button>
            )}

            {paymentMessage && (
                <p className={`payment-status-message ${
                    paymentMessage.includes('successful') || paymentMessage.includes('Proceed to Dashboard')
                        ? 'payment-status-success' : 'payment-status-error'
                } mt-4`}>
                    {paymentMessage}
                </p>
            )}
        </form>
    );
};


// --- Payment Page Component ---
const PaymentPage = ({ selectedPlan, navigateToDashboard }) => {
    const plan = SUBSCRIPTION_PLANS[selectedPlan];

    if (!plan) {
        // Fallback or redirect if no plan is selected
        navigateToDashboard(); // Or to pricing page
        return null;
    }

    // Free and Custom Pricing plans don't need Stripe Elements
    const requiresStripe = plan.price !== 'Free' && plan.price !== 'Custom Pricing';

    return (
        <div className="payment-page">
            <div className="payment-card">
                <CreditCard className="payment-icon" />
                <h2 className="payment-title">Complete Your Subscription</h2>
                <p className="payment-plan-info">
                    You've selected the <span className="highlight-text">{plan.name}</span>.
                    Price: <span className="highlight-text">{plan.price}</span>
                </p>

                {requiresStripe ? (
                    <Elements stripe={stripePromise}>
                        <CheckoutForm selectedPlan={selectedPlan} navigateToDashboard={navigateToDashboard} />
                    </Elements>
                ) : (
                    <CheckoutForm selectedPlan={selectedPlan} navigateToDashboard={navigateToDashboard} />
                )}
                
                <p className="payment-note">
                    (This is a mock payment process for demonstration purposes, actual card processing is by Stripe.)
                </p>
            </div>
        </div>
    );
};

// --- Module Components (Skeletons for future expansion) ---

// Helper to check if a module/feature is allowed for the current subscription
const isAllowed = (currentSubscription, requiredLevel) => {
    const levels = Object.keys(SUBSCRIPTION_PLANS);
    return levels.indexOf(currentSubscription) >= levels.indexOf(requiredLevel);
};

// AI-Powered Fraud Detection Module
const FraudDetectionModule = () => {
    const { subscriptionLevel, userId } = useAuth();
    const [transactions, setTransactions] = useState([]);
    const [analysisResult, setAnalysisResult] = useState('');
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);

    const canAccessAdvanced = isAllowed(subscriptionLevel, 'standard');

    const runFraudAnalysis = useCallback(async () => {
        if (!canAccessAdvanced) {
            setAnalysisResult("Upgrade to Standard or Premium to run advanced fraud analysis.");
            return;
        }
        setLoadingAnalysis(true);
        setAnalysisResult('Analyzing transaction patterns...');
        try {
            // Simulate API call to an Azure Function for fraud analysis
            const response = await fetch(`${API_BASE_URL}/FraudDetectionApi`, { // Conceptual Azure Function
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, transactions }) // Send user ID and transaction data
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setAnalysisResult(result.analysisResult || "Analysis complete.");
        } catch (error) {
            console.error("Error running fraud analysis via API:", error);
            setAnalysisResult("Failed to run fraud analysis.");
        } finally {
            setLoadingAnalysis(false);
        }
    }, [canAccessAdvanced, userId, transactions]);

    useEffect(() => {
        const mockTransactions = [
            { id: 'T101', amount: 50.00, type: 'purchase', location: 'New York' },
            { id: 'T102', amount: 1200.00, type: 'transfer', location: 'London' },
            { id: 'T103', amount: 25.50, type: 'purchase', location: 'New York' },
        ];
        setTransactions(mockTransactions);
    }, []);

    return (
        <div className="module-card module-fraud-detection">
            <h2 className="module-title">
                <Brain className="icon-margin-right" size={30} /> AI-Powered Fraud Detection
            </h2>
            <p className="module-description">
                This module leverages AI and Machine Learning to detect fraudulent activities by analyzing transaction behaviors and scam patterns.
            </p>

            <h3 className="module-subtitle">
                <Activity className="icon-margin-right" size={20} /> Recent Transactions (Mock)
            </h3>
            <ul className="module-list">
                {transactions.map(t => (
                    <li key={t.id}>ID: {t.id}, Amount: ${t.amount.toFixed(2)}, Type: {t.type}, Location: {t.location}</li>
                ))}
            </ul>

            <button
                onClick={runFraudAnalysis}
                className={`btn-run-analysis ${canAccessAdvanced ? 'btn-green' : 'btn-disabled'}`}
                disabled={loadingAnalysis || !canAccessAdvanced}
            >
                {loadingAnalysis ? (
                    <Loader2 className="spinner icon-margin-right" size={20} />
                ) : (
                    <><Zap className="icon-inline-margin-right" size={20} /> Run Fraud Analysis</>
                )}
            </button>
            {!canAccessAdvanced && (
                <p className="module-access-restricted">Upgrade to Standard Plan for full fraud detection capabilities.</p>
            )}

            {analysisResult && (
                <div className={`analysis-result-box ${analysisResult.includes("High Risk") ? "analysis-result-high-risk" : "analysis-result-low-risk"}`}>
                    <h4 className="analysis-result-title">
                        {analysisResult.includes("High Risk") ? <AlertCircle className="icon-margin-right" size={20} /> : <CheckCircle className="icon-margin-right" size={20} />}
                        Analysis Result:
                    </h4>
                    <p className="analysis-result-text">{analysisResult}</p>
                </div>
            )}

            <div className="module-note">
                <p>REPLACE: Actual integration would involve secure API calls to Azure Machine Learning inference endpoints, Azure Cognitive Services for anomaly detection, and potentially Azure Functions for real-time processing of transaction streams.</p>
            </div>
        </div>
    );
};

// Threat Intelligence & Monitoring Module
const ThreatIntelMonitoringModule = () => {
    const { subscriptionLevel } = useAuth();
    const [threats, setThreats] = useState([]);
    const [honeypotStatus, setHoneypotStatus] = useState('Monitoring...');
    const [loadingThreats, setLoadingThreats] = useState(false);

    const canAccessFullMonitoring = isAllowed(subscriptionLevel, 'standard');

    const fetchThreatData = useCallback(async () => {
        if (!canAccessFullMonitoring) {
            setThreats([]);
            setHoneypotStatus('Upgrade for detailed monitoring.');
            return;
        }
        setLoadingThreats(true);
        try {
            // Simulate API call to an Azure Function for threat data
            const response = await fetch(`${API_BASE_URL}/ThreatIntelApi`, { // Conceptual Azure Function
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setThreats(result.threats || []);
            setHoneypotStatus(result.honeypotStatus || 'Active');
        } catch (error) {
            console.error("Error fetching threat data via API:", error);
            setThreats([]);
            setHoneypotStatus('Failed to retrieve status.');
        } finally {
            setLoadingThreats(false);
        }
    }, [canAccessFullMonitoring]);

    useEffect(() => {
        fetchThreatData();
    }, [fetchThreatData]);

    return (
        <div className="module-card module-threat-intel">
            <h2 className="module-title">
                <Bell className="icon-margin-right" size={30} /> Threat Intelligence & Monitoring
            </h2>
            <p className="module-description">
                This module provides real-time security information and event management (SIEM), integrates threat intelligence feeds, and monitors cyber deception technologies (honeypots).
            </p>

            {!canAccessFullMonitoring && (
                <div className="module-access-restricted-box">
                    <AlertCircle className="icon-inline-margin-right" size={18} /> Upgrade to Standard Plan for full threat intelligence and monitoring.
                </div>
            )}

            <div className={`info-grid ${!canAccessFullMonitoring ? 'disabled-opacity' : ''}`}>
                <div className="info-box">
                    <h3 className="info-box-title">
                        <Wifi className="icon-margin-right" size={20} /> Honeypot Status
                    </h3>
                    <p className="info-box-text">{honeypotStatus}</p>
                </div>
                <div className="info-box">
                    <h3 className="info-box-title">
                        <Database className="icon-margin-right" size={20} /> Data Security
                    </h3>
                    <p className="info-box-text">Homomorphic Encryption: <span className="status-active">Active</span></p>
                </div>
            </div>

            <h3 className="module-subtitle">
                <ShieldAlert className="icon-margin-right" size={20} /> Active Threats & Alerts
            </h3>
            {loadingThreats && canAccessFullMonitoring ? (
                <div className="module-loading">
                    <Loader2 className="spinner" size={20} /> Fetching live threat data...
                </div>
            ) : threats.length > 0 && canAccessFullMonitoring ? (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Source</th>
                                <th>Severity</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            {threats.map((threat) => (
                                <tr key={threat.id} className={threat.severity === 'Critical' ? 'row-critical' : ''}>
                                    <td>{threat.type}</td>
                                    <td>{threat.source}</td>
                                    <td className={
                                        threat.severity === 'Critical' ? 'severity-critical' :
                                        threat.severity === 'High' ? 'severity-high' : 'severity-normal'
                                    }>
                                        {threat.severity}
                                    </td>
                                    <td>{threat.timestamp}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : canAccessFullMonitoring ? (
                <p className="module-empty-state">No current threats detected. Keep monitoring!</p>
            ) : (
                <p className="module-empty-state">Access restricted. Upgrade plan to view threats.</p>
            )}

            <div className="module-note">
                <p>REPLACE: Real-time threat data would be pulled from Azure Sentinel workspaces. Cyber deception technologies would be deployed as Azure resources (VMs, Containers) acting as honeypots, and their logs would feed into Sentinel for analysis. Homomorphic encryption implementation would likely be at the data processing layer on Azure infrastructure.</p>
            </div>
        </div>
    );
};

// Scam Prevention & Education Module
const ScamPreventionEducationModule = () => {
    const { subscriptionLevel, userId } = useAuth();
    const [scamReportText, setScamReportText] = useState('');
    const [reportStatus, setReportStatus] = useState('');
    const [loadingReport, setLoadingReport] = useState(false);
    const [communityAlerts, setCommunityAlerts] = useState([]);

    const canSubmitAdvancedReport = isAllowed(subscriptionLevel, 'standard');

    const submitScamReport = useCallback(async () => {
        if (!scamReportText) {
            setReportStatus('Please describe the scam.');
            return;
        }
        if (!canSubmitAdvancedReport && scamReportText.length > 100) { // Example of limited free feature
             setReportStatus('Free plan reports are limited to 100 characters. Upgrade to Standard for longer reports.');
             return;
        }
        setLoadingReport(true);
        setReportStatus('Submitting report...');
        try {
            // Simulate API call to an Azure Function for scam report submission
            const response = await fetch(`${API_BASE_URL}/ScamReportApi`, { // Conceptual Azure Function
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, reportText: scamReportText })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setReportStatus(result.message || 'Scam report submitted successfully!');
            setScamReportText('');
            // After successful submission, refresh alerts or add the new one locally for immediate feedback
            setCommunityAlerts(prev => [...prev, {
                id: Date.now(), // Mock ID
                description: scamReportText.substring(0, 70) + '...',
                type: result.predicted_scam_type || 'User Reported',
                timestamp: new Date().toLocaleString()
            }]);
        } catch (error) {
            console.error("Error submitting scam report via API:", error);
            setReportStatus('Failed to submit scam report.');
        } finally {
            setLoadingReport(false);
        }
    }, [scamReportText, canSubmitAdvancedReport, userId]);

    const fetchCommunityAlerts = useCallback(async () => {
        try {
            // Simulate API call to an Azure Function for fetching community alerts
            const response = await fetch(`${API_BASE_URL}/CommunityAlertsApi`, { // Conceptual Azure Function
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setCommunityAlerts(result.alerts || []);
        } catch (error) {
            console.error("Error fetching community alerts via API:", error);
            setCommunityAlerts([]);
        }
    }, []);

    useEffect(() => {
        fetchCommunityAlerts();
    }, [fetchCommunityAlerts]);

    return (
        <div className="module-card module-scam-prevention">
            <h2 className="module-title">
                <Book className="icon-margin-right" size={30} /> Scam Prevention & Education
            </h2>
            <p className="module-description">
                This module provides AI-driven educational content on scams, facilitates automated scam reporting, and leverages a community-driven fraud database for real-time alerts.
            </p>

            <div className="module-section">
                <h3 className="module-subtitle">
                    <MessageSquareText className="icon-margin-right" size={20} /> AI-Driven Scam Education Chatbot
                </h3>
                <p className="module-text">Ask the AI about common scam tactics or how to protect yourself:</p>
                <AIChatbot prompt="Explain common phishing scam characteristics." />
            </div>

            <div className="module-section">
                <h3 className="module-subtitle">
                    <AlertCircle className="icon-margin-right" size={20} /> Automated Scam Reporting
                </h3>
                <textarea
                    className="form-textarea"
                    rows="4"
                    placeholder="Describe the scam you encountered (e.g., suspicious email, phone call, website)..."
                    value={scamReportText}
                    onChange={(e) => setScamReportText(e.target.value)}
                    disabled={loadingReport}
                ></textarea>
                {!canSubmitAdvancedReport && (
                    <p className="text-orange-warning">Free plan: Reports limited to 100 characters.</p>
                )}
                <button
                    onClick={submitScamReport}
                    className={`btn-report-scam ${loadingReport ? 'btn-disabled' : 'btn-green'}`}
                    disabled={loadingReport}
                >
                    {loadingReport ? (
                        <Loader2 className="spinner icon-margin-right" size={20} />
                    ) : (
                        <><Zap className="icon-inline-margin-right" size={20} /> Submit Scam Report</>
                    )}
                </button>
                {reportStatus && <p className="report-status-message">{reportStatus}</p>}
            </div>

            <div className="module-section">
                <h3 className="module-subtitle">
                    <Users className="icon-margin-right" size={20} /> Community-Driven Scam Alerts
                </h3>
                {communityAlerts.length > 0 ? (
                    <ul className="module-list">
                        {communityAlerts.map(alert => (
                            <li key={alert.id} className="list-item-with-details">
                                <span className="font-medium">{alert.type}:</span> {alert.description} <span className="text-date">({alert.timestamp})</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="module-empty-state">No community alerts yet. Be the first to report!</p>
                )}
            </div>

            <div className="module-note">
                <p>REPLACE: Integration would involve Azure Cognitive Services for content moderation of reports, Azure Cosmos DB or Firestore for the community database, and Azure Functions for backend processing of reports and generating real-time alerts.</p>
            </div>
        </div>
    );
};

// Secure AI Development Framework Module
const SecureAIDevFrameworkModule = () => {
    const { subscriptionLevel } = useAuth();
    const [modelProtectionStatus, setModelProtectionStatus] = useState('Checking...');
    const [zeroTrustStatus, setZeroTrustStatus] = useState('Assessing...');
    const [encryptionStatus, setEncryptionStatus] = useState('Verifying...');

    const canAccessFramework = isAllowed(subscriptionLevel, 'premium');

    useEffect(() => {
        if (!canAccessFramework) {
            setModelProtectionStatus('Access Restricted: Upgrade to Premium.');
            setZeroTrustStatus('Access Restricted: Upgrade to Premium.');
            setEncryptionStatus('Access Restricted: Upgrade to Premium.');
            return;
        }
        const timer = setTimeout(() => {
            setModelProtectionStatus('Adversarial Robustness Toolkit (ART): Configured');
            setZeroTrustStatus('Zero-Trust Architecture: Implemented across key services');
            setEncryptionStatus('End-to-End Encryption: Active for all sensitive data');
        }, 2000);
        return () => clearTimeout(timer);
    }, [canAccessFramework]);

    const runSecurityScan = useCallback(async () => {
        if (!canAccessFramework) return;
        setModelProtectionStatus('Running AI model vulnerability scan...');
        setZeroTrustStatus('Re-validating Zero-Trust policies...');
        setEncryptionStatus('Auditing encryption configurations...');
        try {
            // Simulate API call to an Azure Function for security scan
            const response = await fetch(`${API_BASE_URL}/SecurityScanApi`, { // Conceptual Azure Function
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scanType: 'full' })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setModelProtectionStatus(result.modelProtectionStatus || 'Scan Complete.');
            setZeroTrustStatus(result.zeroTrustStatus || 'Policies validated.');
            setEncryptionStatus(result.encryptionStatus || 'Configurations audited.');
        } catch (error) {
            console.error("Error running security scan via API:", error);
            // Fallback to previous simulated status or an error message
            setModelProtectionStatus('Security scan failed.');
            setZeroTrustStatus('Policy validation failed.');
            setEncryptionStatus('Encryption audit failed.');
        }

    }, [canAccessFramework]);

    return (
        <div className="module-card module-ai-dev-framework">
            <h2 className="module-title">
                <Code className="icon-margin-right" size={30} /> Secure AI Development Framework
            </h2>
            <p className="module-description">
                This module ensures the security of our AI models against adversarial attacks, enforces zero-trust principles, and manages end-to-end encryption for user data protection.
            </p>

            {!canAccessFramework && (
                <div className="module-access-restricted-box">
                    <AlertCircle className="icon-inline-margin-right" size={18} /> Upgrade to Premium Plan to access the Secure AI Development Framework.
                </div>
            )}

            <div className={`info-section ${!canAccessFramework ? 'disabled-opacity' : ''}`}>
                <h3 className="info-section-title">
                    <Layers className="icon-margin-right" size={20} /> AI Model Protection
                </h3>
                <p className="info-section-text">{modelProtectionStatus}</p>
            </div>

            <div className={`info-section ${!canAccessFramework ? 'disabled-opacity' : ''}`}>
                <h3 className="info-section-title">
                    <Key className="icon-margin-right" size={20} /> Zero-Trust Architecture
                </h3>
                <p className="info-section-text">{zeroTrustStatus}</p>
            </div>

            <div className={`info-section ${!canAccessFramework ? 'disabled-opacity' : ''}`}>
                <h3 className="info-section-title">
                    <Lock className="icon-margin-right" size={20} /> End-to-End Encryption
                </h3>
                <p className="info-section-text">{encryptionStatus}</p>
            </div>

            <button
                onClick={runSecurityScan}
                className={`btn-run-scan ${canAccessFramework ? 'btn-yellow' : 'btn-disabled'}`}
                disabled={!canAccessFramework}
            >
                <><ShieldCheck className="icon-inline-margin-right" size={20} /> Run Framework Security Scan</>
            </button>

            <div className="module-note">
                <p>REPLACE: This module would involve continuous integration with Azure Security Center (Defender for Cloud), Azure Policy, Azure Kubernetes Service (AKS) for secure container deployments, and leveraging libraries like the Adversarial Robustness Toolbox within your Azure ML workflows. End-to-end encryption details would be managed via Azure Key Vault and network security groups.</p>
            </div>
        </div>
    );
};

// Innovative Cybersecurity Designs Module (Conceptual overview/landing page)
const InnovativeDesignsModule = () => {
    return (
        <div className="module-card module-innovative-designs">
            <h2 className="module-title">
                <GitFork className="icon-margin-right" size={30} /> Innovative Cybersecurity Designs
            </h2>
            <p className="module-description">
                Our platform incorporates cutting-edge designs to stay ahead of evolving cyber threats, focusing on proactive defense mechanisms and advanced analytics.
            </p>

            <div className="design-grid">
                <div className="design-item">
                    <Fingerprint className="design-icon" />
                    <h3 className="design-title">Behavioral Biometrics</h3>
                    <p className="design-text">
                        Detecting anomalies in user interaction patterns for enhanced identity protection.
                    </p>
                    <p className="design-note">
                        <Info className="icon-inline-margin-right" size={12} /> Integrated into User Authentication.
                    </p>
                </div>
                <div className="design-item">
                    <Globe className="design-icon" />
                    <h3 className="design-title">Cyber Deception Technologies</h3>
                    <p className="design-text">
                        Luring and analyzing attackers with honeypots to gather threat intelligence.
                    </p>
                    <p className="design-note">
                        <Info className="icon-inline-margin-right" size={12} /> Covered in Threat Monitoring.
                    </p>
                </div>
                <div className="design-item">
                    <ShieldAlert className="design-icon" />
                    <h3 className="design-title">Secure AI Development Frameworks</h3>
                    <p className="design-text">
                        Protecting AI models from adversarial attacks and ensuring their integrity.
                    </p>
                    <p className="design-note">
                        <Info className="icon-inline-margin-right" size={12} /> Dedicated module for framework security.
                    </p>
                </div>
                <div className="design-item">
                    <Cpu className="design-icon" />
                    <h3 className="design-title">Homomorphic Encryption</h3>
                    <p className="design-text">
                        Processing sensitive data while it remains encrypted, preserving privacy.
                    </p>
                    <p className="design-note">
                        <Info className="icon-inline-margin-right" size={12} /> Foundational for data security.
                    </p>
                </div>
                <div className="design-item">
                    <Handshake className="design-icon" />
                    <h3 className="design-title">Community-Driven Defense</h3>
                    <p className="design-text">
                        Leveraging collective intelligence for real-time scam and threat alerts.
                    </p>
                    <p className="design-note">
                        <Info className="icon-inline-margin-right" size={12} /> Part of Scam Prevention.
                    </p>
                </div>
                <div className="design-item">
                    <Settings className="design-icon" />
                    <h3 className="design-title">Zero-Trust Architecture</h3>
                    <p className="design-text">
                        Strict identity verification and access controls for all resources.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                        <Info className="icon-inline-margin-right" size={12} /> Core security principle.
                    </p>
                </div>
            </div>

            <div className="module-note">
                <p>REPLACE: This section serves as an overview. Each design principle would have deeper integration across the various core modules, utilizing Azure's advanced security and AI capabilities.</p>
            </div>
        </div>
    );
};


// --- Dashboard Component ---
// This component acts as the main authenticated view, displaying user info
// and providing navigation to different cybersecurity modules.
const Dashboard = () => {
    const { user, logout, userId, subscriptionLevel } = useAuth();
    const [securityTipPrompt, setSecurityTipPrompt] = useState('');
    const [alertExplanationPrompt, setAlertExplanationPrompt] = useState('');
    const [activeModule, setActiveModule] = useState('overview'); // State for active module view

    useEffect(() => {
        // Generate a dynamic prompt for the AI security tip based on mock security score
        if (user && user.securityScore) {
            let prompt = `Provide a concise cybersecurity tip for a user with a ${user.securityScore.score} security risk score. Focus on practical steps related to identity protection and secure authentication.`;
            if (user.securityScore.score === 'High Risk') {
                prompt += " Emphasize immediate actions to secure their account.";
            } else if (user.securityScore.score === 'Medium Risk') {
                prompt += " Suggest proactive measures to improve security posture.";
            } else { // Low Risk
                prompt += " Offer a general best practice for ongoing security awareness.";
            }
            setSecurityTipPrompt(prompt);
        }
    }, [user]);

    const handleGenerateMockAlert = useCallback(() => {
        // Simulate a mock security alert and ask AI to explain it
        const mockAlerts = [
            "Unusual login attempt detected from new geographic location. IP: 203.0.113.45 (Nigeria).",
            "Multiple failed login attempts detected for your account in a short period.",
            "Suspicious file access pattern identified on a critical server. User: JohnDoe, File: sensitive_data.xlsx.",
            "Potential phishing email detected in your inbox. Sender: fakebank.com, Subject: Urgent Account Verification.",
            "Behavioral anomaly detected during recent session: typing speed significantly faster than usual baseline."
        ];
        const randomAlert = mockAlerts[Math.floor(Math.random() * mockAlerts.length)];
        setAlertExplanationPrompt(`Explain the following cybersecurity alert and suggest immediate user actions: "${randomAlert}"`);
    }, []);

    const allowedModules = SUBSCRIPTION_PLANS[subscriptionLevel]?.allowedModules || ['overview'];

    // Function to render the active module component
    const renderActiveModule = () => {
        switch (activeModule) {
            case 'fraud-detection':
                return <FraudDetectionModule />;
            case 'threat-intel':
                return <ThreatIntelMonitoringModule />;
            case 'scam-prevention':
                return <ScamPreventionEducationModule />;
            case 'ai-dev-framework':
                return <SecureAIDevFrameworkModule />;
            case 'innovative-designs':
                return <InnovativeDesignsModule />;
            case 'overview':
            default:
                // Safely access user.securityScore.score and user.securityScore.details
                // Ensure user and user.securityScore are not null before accessing properties
                const userScore = user?.securityScore?.score || 'Low Risk';
                const userDetails = user?.securityScore?.details || 'No significant behavioral anomalies detected.';

                return (
                    <>
                        {/* User Profile & Security Score */}
                        <div className="dashboard-grid-two-cols">
                            <div className="dashboard-card profile-card">
                                <h3 className="dashboard-card-title">
                                    <User className="icon-margin-right" size={24} /> User Profile
                                </h3>
                                {/* Ensure user is not null before accessing its properties */}
                                {user && (
                                    <>
                                        <p className="profile-detail"><span className="profile-label">Username:</span> {user.username}</p>
                                        <p className="profile-detail break-all"><span className="profile-label">User ID:</span> {userId}</p>
                                        <p className="profile-detail"><span className="profile-label">Role:</span> {user.role}</p>
                                        <p className="profile-detail"><span className="profile-label">Current Plan:</span> <span className="highlight-text">{SUBSCRIPTION_PLANS[subscriptionLevel]?.name}</span></p>
                                        {user.fullName && <p className="profile-detail"><span className="profile-label">Full Name:</span> {user.fullName}</p>}
                                        {user.dob && <p className="profile-detail"><span className="profile-label">Date of Birth:</span> {user.dob}</p>}
                                        {user.loginMethod && <p className="profile-detail"><span className="profile-label">Login Method:</span> {user.loginMethod}</p>}
                                        <p className="profile-detail"><span className="profile-label">Last Login:</span> {user.lastLogin}</p>
                                    </>
                                )}
                            </div>

                            <div className={`dashboard-card security-score-card ${
                                userScore === 'High Risk' ? 'security-high-risk' :
                                userScore === 'Medium Risk' ? 'security-medium-risk' :
                                'security-low-risk'
                            }`}>
                                <h3 className={`dashboard-card-title ${
                                    userScore === 'High Risk' ? 'text-red' :
                                    userScore === 'Medium Risk' ? 'text-yellow' :
                                    'text-green'
                                }`}>
                                    {userScore === 'High Risk' && <AlertCircle className="icon-margin-right" size={24} />}
                                    {userScore === 'Medium Risk' && <Info className="icon-margin-right" size={24} />}
                                    {userScore === 'Low Risk' && <CheckCircle className="icon-margin-right" size={24} />}
                                    AI Security Risk Score
                                </h3>
                                <p className={`security-score-value ${
                                    userScore === 'High Risk' ? 'text-red' :
                                    userScore === 'Medium Risk' ? 'text-yellow' :
                                    'text-green'
                                }`}>{userScore}</p>
                                <p className="security-score-description">
                                    This score is based on your recent login behavior and simulated AI analysis.
                                    A higher score indicates potential anomalies.
                                </p>
                                {userDetails && userDetails !== 'No significant behavioral anomalies detected.' && (
                                     <p className="security-score-details">
                                        <Info className="icon-inline-margin-right" size={16} /> Details: {userDetails}
                                    </p>
                                )}
                                {userScore === 'High Risk' && (
                                    <p className="security-score-actions">
                                        <AlertCircle className="icon-inline-margin-right" size={16} /> Immediate action may be required.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* AI-generated Security Tip */}
                        <div className="dashboard-card security-tip-card">
                            <h3 className="dashboard-card-title">
                                <MessageSquareText className="icon-margin-right" size={24} /> AI Security Insights
                            </h3>
                            <AIChatbot prompt={securityTipPrompt} />
                        </div>

                        {/* Mock Security Alert Generator */}
                        <div className="dashboard-card mock-alert-card">
                            <h3 className="dashboard-card-title">
                                <AlertCircle className="icon-margin-right" size={24} /> Simulate Security Alert
                            </h3>
                            <p className="module-text">
                                Click the button below to generate a mock security alert and get an AI explanation on how to respond.
                            </p>
                            <button
                                onClick={handleGenerateMockAlert}
                                className="btn-purple"
                            >
                                Generate Mock Alert & Get AI Guidance
                            </button>
                            {alertExplanationPrompt && (
                                <AIChatbot prompt={alertExplanationPrompt} />
                            )}
                        </div>
                    </>
                );
        }
    };

    if (!user) {
        return (
            <div className="loading-page">
                <div className="loading-content">
                    <p className="loading-text">Access Denied. Please log in.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-layout">
            {/* Sidebar Navigation */}
            <nav className="sidebar-nav">
                <div className="sidebar-header">
                    <ShieldCheck className="sidebar-icon" />
                    <span className="sidebar-title">SyncBridge</span>
                </div>
                <ul className="sidebar-menu">
                    <li>
                        <button
                            onClick={() => setActiveModule('overview')}
                            className={`sidebar-button ${activeModule === 'overview' ? 'sidebar-button-active' : ''}`}
                        >
                            <User className="icon-margin-right" size={20} /> Dashboard Overview
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('fraud-detection')}
                            className={`sidebar-button ${activeModule === 'fraud-detection' && allowedModules.includes('fraud-detection') ? 'sidebar-button-active' : ''} ${!allowedModules.includes('fraud-detection') ? 'sidebar-button-disabled' : ''}`}
                            disabled={!allowedModules.includes('fraud-detection')}
                        >
                            <Brain className="icon-margin-right" size={20} /> AI Fraud Detection
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('threat-intel')}
                            className={`sidebar-button ${activeModule === 'threat-intel' && allowedModules.includes('threat-intel') ? 'sidebar-button-active' : ''} ${!allowedModules.includes('threat-intel') ? 'sidebar-button-disabled' : ''}`}
                            disabled={!allowedModules.includes('threat-intel')}
                        >
                            <Bell className="icon-margin-right" size={20} /> Threat Intel & Monitoring
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('scam-prevention')}
                            className={`sidebar-button ${activeModule === 'scam-prevention' && allowedModules.includes('scam-prevention') ? 'sidebar-button-active' : ''} ${!allowedModules.includes('scam-prevention') ? 'sidebar-button-disabled' : ''}`}
                            disabled={!allowedModules.includes('scam-prevention')}
                        >
                            <Book className="icon-margin-right" size={20} /> Scam Prevention & Edu.
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('ai-dev-framework')}
                            className={`sidebar-button ${activeModule === 'ai-dev-framework' && allowedModules.includes('ai-dev-framework') ? 'sidebar-button-active' : ''} ${!allowedModules.includes('ai-dev-framework') ? 'sidebar-button-disabled' : ''}`}
                            disabled={!allowedModules.includes('ai-dev-framework')}
                        >
                            <Code className="icon-margin-right" size={20} /> Secure AI Dev Framework
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('innovative-designs')}
                            className={`sidebar-button ${activeModule === 'innovative-designs' && allowedModules.includes('innovative-designs') ? 'sidebar-button-active' : ''}`}
                        >
                            <GitFork className="icon-margin-right" size={20} /> Innovative Designs
                        </button>
                    </li>
                    <li className="sidebar-separator">
                        <button
                            onClick={logout}
                            className="sidebar-logout-button"
                        >
                            <LogOut className="icon-margin-right" size={20} /> Log Out
                        </button>
                    </li>
                </ul>
            </nav>

            {/* Main Content Area */}
            <div className="main-content-area">
                {renderActiveModule()}
            </div>
        </div>
    );
};

// --- Main App Component (AuthRouter) ---
// Manages routing between Welcome, Get Started, Login/Signup, Profile Setup, Pricing, Payment, and Dashboard
const AuthRouter = () => {
    const { isLoggedIn, isAuthReady, subscriptionLevel, needsProfileCompletion } = useAuth();
    const [currentView, setCurrentView] = useState('welcome');
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);

    const navigateToWelcome = useCallback(() => setCurrentView('welcome'), []);
    const navigateToGetStarted = useCallback(() => setCurrentView('getStarted'), []);
    const navigateToLoginSignupChoice = useCallback(() => setCurrentView('loginSignupChoice'), []);
    const navigateToLogin = useCallback(() => setCurrentView('login'), []);
    const navigateToSignup = useCallback(() => setCurrentView('signup'), []);
    const navigateToProfileSetup = useCallback(() => setCurrentView('profileSetup'), []);
    const navigateToPricing = useCallback(() => setCurrentView('pricing'), []);
    const navigateToPayment = useCallback((plan) => {
        setSelectedPlanForPayment(plan);
        setCurrentView('payment');
    }, []);
    const navigateToDashboard = useCallback(() => setCurrentView('dashboard'), []);

    // Effect to handle navigation based on authentication and profile status
    useEffect(() => {
        if (isAuthReady) {
            if (isLoggedIn) {
                if (needsProfileCompletion) {
                    setCurrentView('profileSetup');
                } else if (subscriptionLevel === 'free') {
                    setCurrentView('pricing');
                } else {
                    setCurrentView('dashboard');
                }
            } else {
                // If not logged in and not already on a public view, redirect to welcome
                if (!['welcome', 'getStarted', 'loginSignupChoice', 'login', 'signup'].includes(currentView)) {
                    setCurrentView('welcome');
                }
            }
        }
    }, [isLoggedIn, isAuthReady, subscriptionLevel, needsProfileCompletion, currentView]);

    const simulateSocialLogin = useCallback(async (method) => {
        console.log(`Simulating login with ${method}`);
        // --- Mock Azure AD B2C Social Login ---
        // In a real flow, this would initiate a redirect to Google/GitHub/Microsoft for OAuth,
        // then Azure AD B2C would handle user creation/lookup and token issuance.
        // For now, we simulate a successful login and user creation/lookup in our mock backend.

        const mockUid = `mock_${method.toLowerCase()}_user_${Date.now()}`;
        sessionStorage.setItem('mock_user_id', mockUid); // Persist mock user for session

        // Simulate fetching/creating user profile via API
        // This will trigger the AuthProvider's fetchOrCreateUserProfile logic
        // which uses the backend API mocks.
        // Ensure mapping to Cosmos DB fields
        const defaultProfile = {
            id: mockUid, // Cosmos DB document ID
            username: `${method}_user_${mockUid.substring(0, 8)}@mock.com`,
            role: 'new_user',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toLocaleString(),
            behavioralBaseline: { avgTypingSpeed: 150, avgPasswordTypingSpeed: 100, totalMouseDistance: 5000, mouseClickCount: 20 },
            securityScore: { score: 'Low Risk', details: 'Initial assessment.' },
            subscription: 'free',
            name: '', // Will be filled in ProfileSetupPage (maps to 'name' in Cosmos DB)
            email: `${method}_user_${mockUid.substring(0, 8)}@mock.com`, // Maps to 'email' in Cosmos DB
            date_of_birth: '', // Will be filled in ProfileSetupPage (maps to 'date_of_birth' in Cosmos DB)
            security_questions: [], // Will be filled in ProfileSetupPage (maps to 'security_questions' in Cosmos DB)
            loginMethod: method,
        };

        try {
            const upsertResult = await fetch(`${API_BASE_URL}/UserProfileApi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: mockUid, profileData: defaultProfile })
            });

            if (!upsertResult.ok) {
                throw new Error(`Failed to simulate social login backend call: ${upsertResult.status}`);
            }

            // After successful mock backend interaction, update AuthContext state directly
            const authContext = useAuth(); // Access auth context to update states
            authContext.setUser({
                uid: mockUid,
                ...defaultProfile,
                fullName: defaultProfile.name,
                dob: defaultProfile.date_of_birth,
                securityQuestions: defaultProfile.security_questions,
            });
            authContext.setUserId(mockUid);
            authContext.setSubscriptionLevel('free');
            authContext.setIsLoggedIn(true);
            authContext.setNeedsProfileCompletion(true); // Social logins usually need profile completion

            setCurrentView('profileSetup'); // Always navigate to profile setup after mock social login

        } catch (error) {
            console.error("Mock social login failed:", error);
            // Optionally set an authError on the context
            // authContext.setAuthError("Social login simulation failed.");
        }
    }, []);


    if (!isAuthReady) {
        return (
            <div className="loading-page">
                <div className="loading-content">
                    <Loader2 className="spinner" />
                    <p className="loading-text">Loading authentication services...</p>
                </div>
            </div>
        );
    }

    switch (currentView) {
        case 'welcome':
            return <WelcomePage navigateToGetStarted={navigateToGetStarted} />;
        case 'getStarted':
            return <GetStartedPage navigateToLoginSignupChoice={navigateToLoginSignupChoice} />;
        case 'loginSignupChoice':
            return <LoginSignupChoice
                navigateToLogin={navigateToLogin}
                navigateToSignup={navigateToSignup}
                simulateSocialLogin={simulateSocialLogin}
            />;
        case 'signup':
            return <Signup navigateToLogin={navigateToLogin} navigateAfterSignup={navigateToProfileSetup} />;
        case 'login':
            return <Login navigateToSignup={navigateToSignup} navigateAfterLogin={navigateToProfileSetup} />;
        case 'profileSetup':
            return <ProfileSetupPage navigateToPricing={navigateToPricing} />;
        case 'pricing':
            // Pass navigateToDashboard to PricingModel so it can send free users to dashboard
            return <PricingModel navigateToPayment={navigateToPayment} navigateToDashboard={navigateToDashboard} />;
        case 'payment':
            if (!selectedPlanForPayment) {
                navigateToPricing();
                return null;
            }
            return <PaymentPage selectedPlan={selectedPlanForPayment} navigateToDashboard={navigateToDashboard} />;
        case 'dashboard':
            return <Dashboard />;
        default:
            return <WelcomePage navigateToGetStarted={navigateToGetStarted} />; // Fallback
    }
};

// --- Top-Level Export ---
export default function CyberSecurityPlatform() {
    return (
        <AuthProvider>
            <AuthRouter />
        </AuthProvider>
    );
}

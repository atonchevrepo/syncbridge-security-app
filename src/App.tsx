import React, { useState, useEffect, useContext, createContext, useCallback, useRef } from 'react';

// Import Firebase modules for client-side integration
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, addDoc, onSnapshot } from 'firebase/firestore';

// Import Lucide React icons for a modern UI
import {
    ShieldCheck, User, Lock, Eye, EyeOff, Activity, AlertCircle, TrendingUp, TrendingDown, Info,
    MessageSquareText, Loader2, LogOut, CheckCircle, Wifi, Database, Layers, Brain, GitFork, Book,
    Fingerprint, Zap, Globe, Cpu, ShieldAlert, Users, Bell, Code, Key, Settings, Handshake, DollarSign, CreditCard, ArrowRight
} from 'lucide-react';

// --- Global Variables (Provided by Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'syncbridge-default-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "REPLACE_YOUR_FIREBASE_API_KEY",
    authDomain: "REPLACE_YOUR_FIREBASE_AUTH_DOMAIN",
    projectId: "REPLACE_YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "REPLACE_YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "REPLACE_YOUR_FIREBASE_APP_ID"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// IMPORTANT: Firestore Security Rules Configuration
// The "Missing or insufficient permissions" error indicates that your Firestore Security Rules
// are preventing write access. You MUST configure these rules in your Firebase Console.
// Go to Firestore -> Rules tab and paste the following:
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Rule for public data (if any) - allowing any authenticated user to read/write
    // match /artifacts/{appId}/public/data/{document=**} {
    //   allow read, write: if request.auth != null;
    // }

    // Rule for private user data - allowing authenticated users to read/write their OWN data
    match /artifacts/{appId}/users/{userId}/{documents=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
*/
// Ensure 'userId' in your Firestore path matches 'request.auth.uid' as demonstrated above.

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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
// Integrates with Firebase for authentication and Firestore for user profile persistence.
const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState(null);
    const [authError, setAuthError] = useState('');
    const [isLoadingAuth, setIsLoadingAuth] = useState(true); // Start loading for initial auth check
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false); // Flag to ensure auth state is settled
    const [subscriptionLevel, setSubscriptionLevel] = useState('free'); // New state for subscription level
    const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false); // New state to track if profile is complete

    // Initialize Firebase Auth and listen for state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUserId(firebaseUser.uid);
                const profileComplete = await fetchOrCreateUserProfile(firebaseUser.uid);
                setIsLoggedIn(true);
                // If profile is not complete, set flag to redirect to profile setup
                setNeedsProfileCompletion(!profileComplete);
            } else {
                if (!initialAuthToken) {
                    try {
                        const anonUserCredential = await signInAnonymously(auth);
                        setUserId(anonUserCredential.user.uid);
                        const profileComplete = await fetchOrCreateUserProfile(anonUserCredential.user.uid);
                        setIsLoggedIn(true);
                        setNeedsProfileCompletion(!profileComplete);
                    } catch (error) {
                        console.error("Anonymous sign-in failed:", error);
                        setAuthError("Failed to sign in anonymously. Please try again.");
                        setIsLoggedIn(false);
                        setUserId(null);
                        setUser(null);
                        setNeedsProfileCompletion(false);
                    }
                } else {
                    setIsLoggedIn(false);
                    setUserId(null);
                    setUser(null);
                    setNeedsProfileCompletion(false);
                }
            }
            setIsLoadingAuth(false);
            setIsAuthReady(true);
        });

        if (initialAuthToken && !auth.currentUser) {
            signInWithCustomToken(auth, initialAuthToken)
                .then(async (userCredential) => {
                    console.log("Signed in with custom token.");
                    const profileComplete = await fetchOrCreateUserProfile(userCredential.user.uid);
                    setNeedsProfileCompletion(!profileComplete);
                })
                .catch((error) => {
                    console.error("Custom token sign-in failed:", error);
                    setAuthError("Failed to sign in with provided token.");
                    setIsLoadingAuth(false);
                    setIsAuthReady(true);
                });
        } else if (!auth.currentUser) {
            setIsLoadingAuth(false);
            setIsAuthReady(true);
        }

        return () => unsubscribe();
    }, [initialAuthToken]);

    // Function to fetch or create user profile in Firestore
    const fetchOrCreateUserProfile = useCallback(async (uid) => {
        if (!uid) return false;
        const userRef = doc(db, `artifacts/${appId}/users/${uid}/profiles`, 'userProfile');
        try {
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const securityScoreData = userData.securityScore || { score: 'Low Risk', details: 'No recent anomalies.' };
                setSubscriptionLevel(userData.subscription || 'free');
                setUser({ uid, ...userData, securityScore: securityScoreData });
                console.log("User profile fetched:", userData);
                // Return true if profile is considered complete, false otherwise
                return !!(userData.fullName && userData.dob && userData.securityQuestions);
            } else {
                const defaultProfile = {
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
                    // New fields for profile setup, initially empty
                    fullName: '',
                    dob: '',
                    securityQuestions: [],
                    loginMethod: 'email', // Default to email for signups via form
                };
                console.log(`Attempting to create new user profile for UID: ${uid} at path: ${userRef.path}`);
                await setDoc(userRef, defaultProfile);
                console.log("New user profile document set successfully.");
                setUser({ uid, ...defaultProfile });
                setSubscriptionLevel('free');
                console.log("New user profile created:", defaultProfile);
                return false; // Profile is not complete yet
            }
        } catch (error) {
            console.error("Error fetching/creating user profile:", error);
            setAuthError("Failed to load user profile.");
            return false;
        }
    }, [appId]);

    // Mock login function for demonstration of credentials and behavioral data
    const login = useCallback(async (usernameInput, passwordInput, mfaCodeInput, behavioralData, loginMethod = 'email') => {
        setIsLoadingAuth(true);
        setAuthError('');
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (usernameInput === 'admin@syncbridge.com' && passwordInput === 'SecurePass123!') {
                await new Promise(resolve => setTimeout(resolve, 500));
                if (mfaCodeInput === MOCK_MFA_CODE) {
                    if (auth.currentUser && auth.currentUser.uid) {
                        const userProfileRef = doc(db, `artifacts/${appId}/users/${auth.currentUser.uid}/profiles`, 'userProfile');
                        const newSecurityScore = detectMockFraud(behavioralData, user?.behavioralBaseline);

                        const updatedUserData = {
                            lastLogin: new Date().toLocaleString(),
                            behavioralBaseline: behavioralData,
                            securityScore: newSecurityScore,
                            loginMethod: loginMethod,
                        };
                        console.log(`Attempting to update user profile for UID: ${auth.currentUser.uid} at path: ${userProfileRef.path}`);
                        await updateDoc(userProfileRef, updatedUserData);
                        console.log("User profile document updated successfully.");
                        setUser(prevUser => ({
                            ...prevUser,
                            ...updatedUserData,
                        }));
                        setIsLoggedIn(true);
                        // Check if profile is complete after login
                        const currentProfile = (await getDoc(userProfileRef)).data();
                        setNeedsProfileCompletion(!(currentProfile.fullName && currentProfile.dob && currentProfile.securityQuestions && currentProfile.securityQuestions.length > 0));
                        console.log("Login successful, user profile updated in Firestore.");
                        return { success: true };
                    } else {
                        // Fallback for cases where auth.currentUser is not yet set (e.g., initial anon login)
                        const mockUid = `mock_login_${Date.now()}`;
                        const defaultProfile = {
                            username: usernameInput,
                            role: 'admin',
                            createdAt: new Date().toISOString(),
                            lastLogin: new Date().toLocaleString(),
                            behavioralBaseline: behavioralData,
                            securityScore: detectMockFraud(behavioralData, behavioralData),
                            subscription: 'premium', // Mock this user as premium if initial login bypasses signup
                            fullName: 'Mock Admin', // Pre-fill for mock admin login
                            dob: '1980-01-01', // Pre-fill for mock admin login
                            securityQuestions: [{question: "What's your first pet's name?", answer: "Buddy"}], // Pre-fill
                            loginMethod: loginMethod,
                        };
                        const userRef = doc(db, `artifacts/${appId}/users/${mockUid}/profiles`, 'userProfile');
                        console.log(`Attempting to set mock admin profile for UID: ${mockUid} at path: ${userRef.path}`);
                        await setDoc(userRef, defaultProfile);
                        console.log("Mock admin profile document set successfully.");
                        setUser({ uid: mockUid, ...defaultProfile });
                        setUserId(mockUid);
                        setSubscriptionLevel('premium');
                        setIsLoggedIn(true);
                        setNeedsProfileCompletion(false); // Mock admin user has complete profile
                        console.log("Mock login successful (no Firestore update for this user).");
                        return { success: true };
                    }
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
    }, [fetchOrCreateUserProfile, user, appId]);

    // Mock signup function
    const signup = useCallback(async (usernameInput, passwordInput, loginMethod = 'email') => {
        setIsLoadingAuth(true);
        setAuthError('');
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const mockUid = `mock_user_${Date.now()}`;
            const defaultProfile = {
                username: usernameInput,
                role: 'new_user',
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toLocaleString(),
                behavioralBaseline: { avgTypingSpeed: 150, avgPasswordTypingSpeed: 100, totalMouseDistance: 5000, mouseClickCount: 20 },
                securityScore: { score: 'Low Risk', details: 'Initial assessment.' },
                subscription: 'free',
                fullName: '', // Needs completion
                dob: '',     // Needs completion
                securityQuestions: [], // Needs completion
                loginMethod: loginMethod,
            };
            const userRef = doc(db, `artifacts/${appId}/users/${mockUid}/profiles`, 'userProfile');
            console.log(`Attempting to set new user profile for UID: ${mockUid} at path: ${userRef.path}`);
            await setDoc(userRef, defaultProfile);
            console.log("New user profile document set successfully during signup.");

            setUser({ uid: mockUid, ...defaultProfile });
            setUserId(mockUid);
            setSubscriptionLevel('free');
            setIsLoggedIn(true);
            setNeedsProfileCompletion(true); // New users always need to complete profile
            console.log("Mock signup successful, profile created in Firestore.");
            return { success: true };
        } catch (error) {
            console.error('Signup error:', error);
            setAuthError('An unexpected error occurred during signup.');
            return { success: false, error: 'Unexpected error' };
        } finally {
            setIsLoadingAuth(false);
        }
    }, [appId]);

    // Function to update user profile details (Name, DOB, Security Questions)
    const updateProfileDetails = useCallback(async (fullName, dob, securityQuestions) => {
        if (!userId) {
            setAuthError("No user logged in to update profile.");
            return false;
        }
        setIsLoadingAuth(true);
        setAuthError('');
        const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profiles`, 'userProfile');
        try {
            const updatedData = {
                fullName,
                dob,
                securityQuestions,
                lastProfileUpdate: new Date().toISOString(),
            };
            console.log(`Attempting to update profile details for UID: ${userId} at path: ${userProfileRef.path}`);
            await updateDoc(userProfileRef, updatedData);
            console.log("User profile details updated successfully.");
            setUser(prevUser => ({
                ...prevUser,
                ...updatedData,
            }));
            setNeedsProfileCompletion(false); // Profile is now complete
            console.log("User profile details updated successfully.");
            return true;
        } catch (error) {
            console.error("Error updating profile details:", error);
            setAuthError("Failed to update profile details.");
            return false;
        } finally {
            setIsLoadingAuth(false);
        }
    }, [userId, appId]);


    const logout = useCallback(async () => {
        setIsLoadingAuth(true);
        setAuthError('');
        try {
            await signOut(auth);
            setIsLoggedIn(false);
            setUser(null);
            setUserId(null);
            setSubscriptionLevel('free');
            setNeedsProfileCompletion(false); // Reset profile completion status on logout
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
        const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profiles`, 'userProfile');
        try {
            console.log(`Attempting to update subscription for UID: ${userId} to ${newLevel} at path: ${userProfileRef.path}`);
            await updateDoc(userProfileRef, { subscription: newLevel });
            console.log("Subscription document updated successfully.");
            setSubscriptionLevel(newLevel);
            setUser(prevUser => ({
                ...prevUser,
                subscription: newLevel,
            }));
            console.log(`Subscription updated to: ${newLevel}`);
        } catch (error) {
            console.error("Error updating subscription:", error);
            setAuthError("Failed to update subscription level.");
        }
    }, [userId, appId]);


    const contextValue = {
        isLoggedIn,
        user,
        authError,
        isLoadingAuth,
        userId,
        subscriptionLevel,
        needsProfileCompletion, // Expose this flag
        login,
        logout,
        signup,
        updateSubscription,
        updateProfileDetails, // Expose profile update function
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
        lastMouseMovePosition.current = { x: 0, y: 0 };
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
        if (prompt) {
            generateResponse();
        }
    }, [prompt, generateResponse]);

    if (loading) return <div className="text-center text-blue-500 flex items-center justify-center p-4"><Loader2 className="animate-spin mr-2" size={20} /> Generating AI Insight...</div>;
    if (error) return <div className="text-center text-red-500 p-4"><AlertCircle className="inline-block mr-2" size={20} /> Error: {error}</div>;
    if (!response) return <div className="text-center text-gray-500 p-4">Awaiting AI insights...</div>;

    return (
        <div className="bg-white p-4 rounded-lg shadow-inner mt-4 border border-gray-200">
            <h4 className="font-semibold text-lg text-gray-800 flex items-center mb-2"><MessageSquareText className="mr-2" size={20} />AI Insight:</h4>
            <p className="text-gray-700 leading-relaxed">{response}</p>
        </div>
    );
};


// --- Welcome Page Component ---
const WelcomePage = ({ navigateToGetStarted }) => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 text-white p-4">
            <div className="text-center bg-white bg-opacity-10 p-8 rounded-xl shadow-2xl backdrop-blur-sm border border-white border-opacity-20 max-w-2xl">
                <ShieldCheck className="mx-auto h-24 w-24 text-indigo-300 mb-6 animate-pulse" />
                <h1 className="text-5xl font-extrabold mb-4 drop-shadow-lg">Welcome to SyncBridge Technologies</h1>
                <p className="text-xl mb-8 leading-relaxed">
                    America's most trusted security company, saving thousands of seniors every day from online threats and scams.
                </p>
                <button
                    onClick={navigateToGetStarted}
                    className="px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-full shadow-lg hover:bg-indigo-700 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center mx-auto"
                >
                    Get Started <ArrowRight className="ml-2" size={24} />
                </button>
            </div>
        </div>
    );
};

// --- Get Started Page Component ---
const GetStartedPage = ({ navigateToLoginSignupChoice }) => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-800 to-pink-900 text-white p-4">
            <div className="text-center bg-white bg-opacity-10 p-8 rounded-xl shadow-2xl backdrop-blur-sm border border-white border-opacity-20 max-w-md">
                <Layers className="mx-auto h-20 w-20 text-purple-300 mb-6" />
                <h2 className="text-4xl font-extrabold mb-4">Your Journey to Security Begins Here</h2>
                <p className="text-lg mb-8">
                    We're committed to protecting your digital life. Let's set up your secure access.
                </p>
                <button
                    onClick={navigateToLoginSignupChoice}
                    className="px-8 py-4 bg-purple-600 text-white font-bold text-lg rounded-full shadow-lg hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center mx-auto"
                >
                    Continue <ArrowRight className="ml-2" size={24} />
                </button>
            </div>
        </div>
    );
};


// --- Login/Signup Choice Component ---
const LoginSignupChoice = ({ navigateToLogin, navigateToSignup, simulateSocialLogin }) => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-blue-900 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 text-center">
                <h2 className="text-3xl font-extrabold text-gray-900 mb-6">How would you like to proceed?</h2>

                <div className="space-y-4">
                    <button
                        onClick={navigateToLogin}
                        className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition ease-in-out duration-150 transform hover:scale-105"
                    >
                        <User className="mr-3" size={20} /> Log In with Email
                    </button>
                    <button
                        onClick={navigateToSignup}
                        className="w-full flex items-center justify-center py-3 px-4 border border-indigo-600 rounded-md shadow-sm text-lg font-medium text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition ease-in-out duration-150 transform hover:scale-105"
                    >
                        <Lock className="mr-3" size={20} /> Sign Up with Email
                    </button>

                    <div className="relative flex py-5 items-center">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="flex-shrink mx-4 text-gray-500">Or continue with</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>

                    <button
                        onClick={() => simulateSocialLogin('Google')}
                        className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition duration-150 ease-in-out transform hover:scale-105"
                    >
                        <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google" className="mr-3" />
                        Login with Google (Mock)
                    </button>
                    <button
                        onClick={() => simulateSocialLogin('GitHub')}
                        className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition duration-150 ease-in-out transform hover:scale-105"
                    >
                        <img src="https://img.icons8.com/ios-filled/24/000000/github.png" alt="GitHub" className="mr-3" />
                        Login with GitHub (Mock)
                    </button>
                </div>
                <p className="mt-6 text-sm text-gray-500">
                    Social login integrations are for demonstration. Actual integration would use OAuth flows.
                </p>
            </div>
        </div>
    );
};


// --- Login Component ---
const Login = ({ navigateToSignup, navigateAfterLogin }) => { // Added navigateAfterLogin prop
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

        const result = await login(username, password, mfaCode, behavioralData, 'email'); // Pass loginMethod
        if (!result.success) {
            setMfaVisible(false);
            setMfaCode('');
            resetBehavioralData();
        }
        // AuthProvider will handle navigation after successful login based on needsProfileCompletion
    };

    if (isLoadingAuth || !isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 p-4">
                <div className="text-white text-center flex flex-col items-center">
                    <Loader2 className="animate-spin h-10 w-10 text-white mb-4" />
                    <p className="text-xl font-semibold">Loading authentication services...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 p-4">
            <div
                className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200"
                onMouseMove={handleMouseMove}
            >
                <div className="text-center mb-8">
                    <ShieldCheck className="mx-auto h-16 w-16 text-indigo-700 mb-4" />
                    <h2 className="text-3xl font-extrabold text-gray-900">SyncBridge Security Platform</h2>
                    <p className="mt-2 text-sm text-gray-600">Secure Access to Your Digital Assets</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                            Email Address
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" aria-hidden="true" />
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
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="you@example.com"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
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
                                className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Your Secure Password"
                                disabled={isLoadingAuth}
                            />
                            <div
                                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-5 w-5 text-gray-400" />
                                ) : (
                                    <Eye className="h-5 w-5 text-gray-400" />
                                )}
                            </div>
                        </div>
                    </div>

                    {mfaVisible && (
                        <div>
                            <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700">
                                MFA Code (e.g., {MOCK_MFA_CODE})
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                </div>
                                <input
                                    id="mfaCode"
                                    name="mfaCode"
                                    type="text"
                                    required
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    placeholder="Enter 6-digit code"
                                    maxLength="6"
                                    disabled={isLoadingAuth}
                                />
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                This simulates a code sent to your registered device.
                            </p>
                        </div>
                    )}

                    {(localError || authError) && (
                        <div className="text-red-600 text-sm mt-2 flex items-center">
                            <AlertCircle className="mr-2" size={16} />
                            {localError || authError}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-500 transition ease-in-out duration-150 transform hover:scale-105"
                            disabled={isLoadingAuth}
                        >
                            {isLoadingAuth ? (
                                <Loader2 className="animate-spin mr-2" size={20} />
                            ) : mfaVisible ? (
                                'Verify MFA & Log In'
                            ) : (
                                'Log In'
                            )}
                        </button>
                    </div>
                </form>
                <div className="mt-6 text-center text-sm text-gray-500">
                    <p>For demonstration, use:</p>
                    <p className="font-semibold">Username: admin@syncbridge.com</p>
                    <p className="font-semibold">Password: SecurePass123!</p>
                    {mfaVisible && <p className="font-semibold">MFA Code: {MOCK_MFA_CODE}</p>}
                    <p className="mt-4">
                        Don't have an account?{' '}
                        <button onClick={navigateToSignup} className="text-indigo-600 hover:text-indigo-800 font-medium">
                            Sign Up
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Signup Component ---
const Signup = ({ navigateToLogin, navigateAfterSignup }) => { // Added navigateAfterSignup prop
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

        const result = await signup(username, password, 'email'); // Pass loginMethod
        if (result.success) {
            navigateAfterSignup(); // After successful signup, AuthProvider will handle further redirection
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                <div className="text-center mb-8">
                    <ShieldCheck className="mx-auto h-16 w-16 text-indigo-700 mb-4" />
                    <h2 className="text-3xl font-extrabold text-gray-900">Sign Up for SyncBridge</h2>
                    <p className="mt-2 text-sm text-gray-600">Create your account to get started</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="signup-username" className="block text-sm font-medium text-gray-700">
                            Email Address
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="signup-username"
                                name="username"
                                type="email"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="you@example.com"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="signup-password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Create a secure password"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                            Confirm Password
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="confirm-password"
                                name="confirm-password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Confirm your password"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>

                    {(localError || authError) && (
                        <div className="text-red-600 text-sm mt-2 flex items-center">
                            <AlertCircle className="mr-2" size={16} />
                            {localError || authError}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-500 transition ease-in-out duration-150 transform hover:scale-105"
                            disabled={isLoadingAuth}
                        >
                            {isLoadingAuth ? (
                                <Loader2 className="animate-spin mr-2" size={20} />
                            ) : (
                                'Sign Up'
                            )}
                        </button>
                    </div>
                </form>
                <div className="mt-6 text-center text-sm text-gray-500">
                    <p>
                        Already have an account?{' '}
                        <button onClick={navigateToLogin} className="text-indigo-600 hover:text-indigo-800 font-medium">
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-800 to-teal-900 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                <div className="text-center mb-8">
                    <User className="mx-auto h-16 w-16 text-blue-700 mb-4" />
                    <h2 className="text-3xl font-extrabold text-gray-900">Complete Your Profile</h2>
                    <p className="mt-2 text-sm text-gray-600">Help us secure your account with additional details.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="full-name" className="block text-sm font-medium text-gray-700">
                            Full Name
                        </label>
                        <input
                            id="full-name"
                            name="full-name"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            disabled={isLoadingAuth}
                        />
                    </div>
                    <div>
                        <label htmlFor="dob" className="block text-sm font-medium text-gray-700">
                            Date of Birth
                        </label>
                        <input
                            id="dob"
                            name="dob"
                            type="date"
                            required
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            disabled={isLoadingAuth}
                        />
                    </div>
                    <div className="space-y-4 pt-4 border-t border-gray-200">
                        <p className="text-lg font-medium text-gray-800">Security Questions:</p>
                        <div>
                            <label htmlFor="sq1" className="block text-sm font-medium text-gray-700">
                                Question 1
                            </label>
                            <input
                                id="sq1"
                                type="text"
                                required
                                value={securityQuestion1}
                                onChange={(e) => setSecurityQuestion1(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="e.g., What was your first pet's name?"
                                disabled={isLoadingAuth}
                            />
                            <label htmlFor="sa1" className="block text-sm font-medium text-gray-700 mt-2">
                                Answer 1
                            </label>
                            <input
                                id="sa1"
                                type="text"
                                required
                                value={securityAnswer1}
                                onChange={(e) => setSecurityAnswer1(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                disabled={isLoadingAuth}
                            />
                        </div>
                        <div>
                            <label htmlFor="sq2" className="block text-sm font-medium text-gray-700">
                                Question 2
                            </label>
                            <input
                                id="sq2"
                                type="text"
                                required
                                value={securityQuestion2}
                                onChange={(e) => setSecurityQuestion2(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="e.g., What city were you born in?"
                                disabled={isLoadingAuth}
                            />
                            <label htmlFor="sa2" className="block text-sm font-medium text-gray-700 mt-2">
                                Answer 2
                            </label>
                            <input
                                id="sa2"
                                type="text"
                                required
                                value={securityAnswer2}
                                onChange={(e) => setSecurityAnswer2(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                disabled={isLoadingAuth}
                            />
                        </div>
                    </div>

                    {(localError || authError) && (
                        <div className="text-red-600 text-sm mt-2 flex items-center">
                            <AlertCircle className="mr-2" size={16} />
                            {localError || authError}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition ease-in-out duration-150 transform hover:scale-105"
                            disabled={isLoadingAuth}
                        >
                            {isLoadingAuth ? (
                                <Loader2 className="animate-spin mr-2" size={20} />
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
const PricingModel = ({ navigateToPayment, navigateToDashboard }) => { // Added navigateToDashboard
    const { subscriptionLevel } = useAuth(); // To highlight current plan

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center">
            <div className="text-center mb-10">
                <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Choose Your Security Plan</h2>
                <p className="text-lg text-gray-600">Select the SyncBridge plan that best fits your needs.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-6xl">
                {Object.keys(SUBSCRIPTION_PLANS).map((key) => {
                    const plan = SUBSCRIPTION_PLANS[key];
                    const isCurrentPlan = subscriptionLevel === key;
                    const isEnterprise = key === 'enterprise';

                    return (
                        <div
                            key={key}
                            className={`bg-white rounded-xl shadow-lg p-6 flex flex-col transform transition-all duration-300 hover:scale-105 ${
                                isCurrentPlan ? 'border-4 border-indigo-600 shadow-indigo-300' : 'border border-gray-200'
                            }`}
                        >
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">{plan.name}</h3>
                            <p className="text-4xl font-extrabold text-indigo-700 mb-4">
                                {plan.price}
                                {!isEnterprise && <span className="text-lg font-medium text-gray-500">/month</span>}
                            </p>
                            <ul className="text-gray-700 space-y-2 flex-grow mb-6">
                                {plan.features.map((feature, index) => (
                                    <li key={index} className="flex items-center">
                                        <CheckCircle className="text-green-500 mr-2" size={18} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-auto">
                                {isCurrentPlan && key === 'free' ? ( // Special handling for 'free' plan if it's current
                                    <button
                                        onClick={navigateToDashboard} // Allows proceeding to dashboard
                                        className="w-full py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition duration-150 ease-in-out transform hover:scale-105 shadow-md"
                                    >
                                        Proceed with Free Plan
                                    </button>
                                ) : isCurrentPlan ? ( // For paid plans, if it's current, disable
                                    <button
                                        className="w-full py-3 rounded-lg bg-gray-300 text-gray-800 font-semibold cursor-not-allowed"
                                        disabled
                                    >
                                        Current Plan
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => navigateToPayment(key)}
                                        className="w-full py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition duration-150 ease-in-out transform hover:scale-105 shadow-md"
                                    >
                                        {isEnterprise ? 'Contact Sales' : 'Choose Plan'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-10 text-center text-gray-600 text-sm italic">
                Our AI-Powered Dynamic Pricing adjusts based on market demand and customer behavior to optimize value.
            </p>
        </div>
    );
};

// --- Payment Page Component ---
const PaymentPage = ({ selectedPlan, navigateToDashboard }) => {
    const { updateSubscription, isLoadingAuth } = useAuth();
    const [paymentStatus, setPaymentStatus] = useState('');
    const [loadingPayment, setLoadingPayment] = useState(false);

    const handlePayment = async () => {
        setLoadingPayment(true);
        setPaymentStatus('');

        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // In a real app, this would involve a payment gateway (Stripe, PayPal, etc.)
        // For demonstration, we'll assume success and update the subscription
        try {
            await updateSubscription(selectedPlan);
            setPaymentStatus(`Payment successful! Welcome to the ${SUBSCRIPTION_PLANS[selectedPlan].name}!`);
            setTimeout(() => {
                navigateToDashboard();
            }, 1000); // Redirect after a short delay
        } catch (error) {
            setPaymentStatus('Payment failed. Please try again.');
            console.error("Payment update error:", error);
        } finally {
            setLoadingPayment(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 text-center">
                <CreditCard className="mx-auto h-16 w-16 text-indigo-700 mb-4" />
                <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Complete Your Subscription</h2>
                <p className="text-gray-700 text-lg mb-6">
                    You've selected the <span className="font-semibold text-indigo-600">{SUBSCRIPTION_PLANS[selectedPlan]?.name}</span>.
                    Price: <span className="font-semibold text-indigo-600">{SUBSCRIPTION_PLANS[selectedPlan]?.price}</span>
                </p>

                <button
                    onClick={handlePayment}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition ease-in-out duration-150 transform hover:scale-105"
                    disabled={loadingPayment || isLoadingAuth}
                >
                    {loadingPayment ? (
                        <Loader2 className="animate-spin mr-2" size={20} />
                    ) : (
                        <><DollarSign className="mr-2" size={20} /> Make Mock Payment</>
                    )}
                </button>

                {paymentStatus && (
                    <p className={`mt-4 text-sm ${paymentStatus.includes('successful') ? 'text-green-600' : 'text-red-600'}`}>
                        {paymentStatus}
                    </p>
                )}
                <p className="mt-4 text-sm text-gray-500 italic">
                    (This is a mock payment process for demonstration purposes.)
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
    const { subscriptionLevel } = useAuth();
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
        await new Promise(resolve => setTimeout(resolve, 2000));
        const mockFraudResult = Math.random() > 0.7 ? "High Risk: Unusual transaction pattern detected." : "Low Risk: Transactions appear normal.";
        setAnalysisResult(mockFraudResult);
        setLoadingAnalysis(false);
    }, [canAccessAdvanced]);

    useEffect(() => {
        const mockTransactions = [
            { id: 'T101', amount: 50.00, type: 'purchase', location: 'New York' },
            { id: 'T102', amount: 1200.00, type: 'transfer', location: 'London' },
            { id: 'T103', amount: 25.50, type: 'purchase', location: 'New York' },
        ];
        setTransactions(mockTransactions);
    }, []);

    return (
        <div className="bg-gray-50 p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Brain className="mr-3" size={30} /> AI-Powered Fraud Detection
            </h2>
            <p className="text-gray-700 mb-4">
                This module leverages AI and Machine Learning to detect fraudulent activities by analyzing transaction behaviors and scam patterns.
            </p>

            <h3 className="text-xl font-semibold text-gray-700 mb-3 flex items-center">
                <Activity className="mr-2" size={20} /> Recent Transactions (Mock)
            </h3>
            <ul className="list-disc pl-5 mb-4 text-gray-700">
                {transactions.map(t => (
                    <li key={t.id}>ID: {t.id}, Amount: ${t.amount.toFixed(2)}, Type: {t.type}, Location: {t.location}</li>
                ))}
            </ul>

            <button
                onClick={runFraudAnalysis}
                className={`px-6 py-3 font-medium rounded-lg transition duration-150 ease-in-out shadow-lg transform hover:scale-105 ${
                    canAccessAdvanced ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-400 text-gray-700 cursor-not-allowed'
                }`}
                disabled={loadingAnalysis || !canAccessAdvanced}
            >
                {loadingAnalysis ? (
                    <Loader2 className="animate-spin mr-2" size={20} />
                ) : (
                    <><Zap className="inline-block mr-2" size={20} /> Run Fraud Analysis</>
                )}
            </button>
            {!canAccessAdvanced && (
                <p className="text-red-500 text-sm mt-2">Upgrade to Standard Plan for full fraud detection capabilities.</p>
            )}

            {analysisResult && (
                <div className={`mt-4 p-4 rounded-lg border ${analysisResult.includes("High Risk") ? "bg-red-100 border-red-400 text-red-800" : "bg-green-100 border-green-400 text-green-800"}`}>
                    <h4 className="font-semibold flex items-center">
                        {analysisResult.includes("High Risk") ? <AlertCircle className="mr-2" size={20} /> : <CheckCircle className="mr-2" size={20} />}
                        Analysis Result:
                    </h4>
                    <p className="mt-2">{analysisResult}</p>
                </div>
            )}

            <div className="mt-6 text-sm text-gray-600 italic">
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
        await new Promise(resolve => setTimeout(resolve, 2500));
        const mockThreats = [
            { id: 1, type: 'Phishing Attempt', source: 'email-campaign.xyz', severity: 'High', timestamp: '2025-06-14 10:30 AM' },
            { id: 2, type: 'Malware Detected', source: 'endpoint-device-123', severity: 'Critical', timestamp: '2025-06-14 10:05 AM' },
            { id: 3, type: 'Honeypot Interaction', source: 'attacker-ip-1.2.3.4', severity: 'Medium', timestamp: '2025-06-14 09:45 AM' },
            { id: 4, type: 'DDoS Activity', source: 'network-edge', severity: 'High', timestamp: '2025-06-13 11:15 PM' },
        ];
        setThreats(mockThreats);
        setHoneypotStatus('Active: 3 new interactions detected.');
        setLoadingThreats(false);
    }, [canAccessFullMonitoring]);

    useEffect(() => {
        fetchThreatData();
    }, [fetchThreatData]);

    return (
        <div className="bg-blue-50 p-6 rounded-xl shadow-md border border-blue-200">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Bell className="mr-3" size={30} /> Threat Intelligence & Monitoring
            </h2>
            <p className="text-gray-700 mb-4">
                This module provides real-time security information and event management (SIEM), integrates threat intelligence feeds, and monitors cyber deception technologies (honeypots).
            </p>

            {!canAccessFullMonitoring && (
                <div className="text-red-500 p-3 bg-red-100 rounded-lg mb-4">
                    <AlertCircle className="inline-block mr-2" size={18} /> Upgrade to Standard Plan for full threat intelligence and monitoring.
                </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 ${!canAccessFullMonitoring ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="bg-white p-4 rounded-lg shadow-inner border border-blue-200">
                    <h3 className="text-xl font-semibold text-gray-700 mb-2 flex items-center">
                        <Wifi className="mr-2" size={20} /> Honeypot Status
                    </h3>
                    <p className="text-blue-700 font-medium">{honeypotStatus}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-inner border border-blue-200">
                    <h3 className="text-xl font-semibold text-gray-700 mb-2 flex items-center">
                        <Database className="mr-2" size={20} /> Data Security
                    </h3>
                    <p className="text-blue-700 font-medium">Homomorphic Encryption: <span className="text-green-600">Active</span></p>
                </div>
            </div>

            <h3 className="text-xl font-semibold text-gray-700 mb-3 flex items-center">
                <ShieldAlert className="mr-2" size={20} /> Active Threats & Alerts
            </h3>
            {loadingThreats && canAccessFullMonitoring ? (
                <div className="text-center text-blue-500 flex items-center justify-center p-4">
                    <Loader2 className="animate-spin mr-2" size={20} /> Fetching live threat data...
                </div>
            ) : threats.length > 0 && canAccessFullMonitoring ? (
                <div className="overflow-x-auto rounded-lg border border-blue-300">
                    <table className="min-w-full divide-y divide-blue-200">
                        <thead className="bg-blue-100">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Source</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Severity</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-blue-200">
                            {threats.map((threat) => (
                                <tr key={threat.id} className={threat.severity === 'Critical' ? 'bg-red-50' : ''}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{threat.type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{threat.source}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                                        threat.severity === 'Critical' ? 'text-red-600' :
                                        threat.severity === 'High' ? 'text-orange-600' : 'text-gray-900'
                                    }`}>
                                        {threat.severity}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{threat.timestamp}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : canAccessFullMonitoring ? (
                <p className="text-gray-500 italic">No current threats detected. Keep monitoring!</p>
            ) : (
                <p className="text-gray-500 italic">Access restricted. Upgrade plan to view threats.</p>
            )}

            <div className="mt-6 text-sm text-gray-600 italic">
                <p>REPLACE: Real-time threat data would be pulled from Azure Sentinel workspaces. Cyber deception technologies would be deployed as Azure resources (VMs, Containers) acting as honeypots, and their logs would feed into Sentinel for analysis. Homomorphic encryption implementation would likely be at the data processing layer on Azure infrastructure.</p>
            </div>
        </div>
    );
};

// Scam Prevention & Education Module
const ScamPreventionEducationModule = () => {
    const { subscriptionLevel } = useAuth();
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
        await new Promise(resolve => setTimeout(resolve, 1500));
        setReportStatus('Scam report submitted successfully! Thank you for contributing to community safety.');
        setScamReportText('');
        setLoadingReport(false);
        setCommunityAlerts(prev => [...prev, {
            id: Date.now(),
            description: scamReportText.substring(0, 70) + '...',
            type: 'User Reported',
            timestamp: new Date().toLocaleString()
        }]);
    }, [scamReportText, canSubmitAdvancedReport]);

    useEffect(() => {
        const mockAlerts = [
            { id: 1, description: 'Phishing SMS impersonating bank asking for password.', type: 'Community', timestamp: '2025-06-14 09:00 AM' },
            { id: 2, description: 'Fake tech support call from "Microsoft" requesting remote access.', type: 'Community', timestamp: '2025-06-13 04:20 PM' },
        ];
        setCommunityAlerts(mockAlerts);
    }, []);

    return (
        <div className="bg-green-50 p-6 rounded-xl shadow-md border border-green-200">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Book className="mr-3" size={30} /> Scam Prevention & Education
            </h2>
            <p className="text-gray-700 mb-4">
                This module provides AI-driven educational content on scams, facilitates automated scam reporting, and leverages a community-driven fraud database for real-time alerts.
            </p>

            <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-3 flex items-center">
                    <MessageSquareText className="mr-2" size={20} /> AI-Driven Scam Education Chatbot
                </h3>
                <p className="text-gray-700 mb-2">Ask the AI about common scam tactics or how to protect yourself:</p>
                <AIChatbot prompt="Explain common phishing scam characteristics." />
            </div>

            <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-3 flex items-center">
                    <AlertCircle className="mr-2" size={20} /> Automated Scam Reporting
                </h3>
                <textarea
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 text-gray-700"
                    rows="4"
                    placeholder="Describe the scam you encountered (e.g., suspicious email, phone call, website)..."
                    value={scamReportText}
                    onChange={(e) => setScamReportText(e.target.value)}
                    disabled={loadingReport}
                ></textarea>
                {!canSubmitAdvancedReport && (
                    <p className="text-orange-500 text-sm mt-1">Free plan: Reports limited to 100 characters.</p>
                )}
                <button
                    onClick={submitScamReport}
                    className={`mt-3 px-6 py-3 font-medium rounded-lg transition duration-150 ease-in-out shadow-lg transform hover:scale-105 ${
                        loadingReport ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                    disabled={loadingReport}
                >
                    {loadingReport ? (
                        <Loader2 className="animate-spin mr-2" size={20} />
                    ) : (
                        <><Zap className="inline-block mr-2" size={20} /> Submit Scam Report</>
                    )}
                </button>
                {reportStatus && <p className="mt-2 text-sm text-gray-700">{reportStatus}</p>}
            </div>

            <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3 flex items-center">
                    <Users className="mr-2" size={20} /> Community-Driven Scam Alerts
                </h3>
                {communityAlerts.length > 0 ? (
                    <ul className="list-disc pl-5 text-gray-700">
                        {communityAlerts.map(alert => (
                            <li key={alert.id} className="mb-1">
                                <span className="font-medium">{alert.type}:</span> {alert.description} <span className="text-gray-500 text-xs">({alert.timestamp})</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 italic">No community alerts yet. Be the first to report!</p>
                )}
            </div>

            <div className="mt-6 text-sm text-gray-600 italic">
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
        await new Promise(resolve => setTimeout(resolve, 3000));
        setModelProtectionStatus('Adversarial Robustness Toolkit (ART): Scan Complete - No new vulnerabilities found.');
        setZeroTrustStatus('Zero-Trust Architecture: Policies validated, compliance OK.');
        setEncryptionStatus('End-to-End Encryption: All data channels are secure.');
    }, [canAccessFramework]);

    return (
        <div className="bg-yellow-50 p-6 rounded-xl shadow-md border border-yellow-200">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Code className="mr-3" size={30} /> Secure AI Development Framework
            </h2>
            <p className="text-gray-700 mb-4">
                This module ensures the security of our AI models against adversarial attacks, enforces zero-trust principles, and manages end-to-end encryption for user data protection.
            </p>

            {!canAccessFramework && (
                <div className="text-red-500 p-3 bg-red-100 rounded-lg mb-4">
                    <AlertCircle className="inline-block mr-2" size={18} /> Upgrade to Premium Plan to access the Secure AI Development Framework.
                </div>
            )}

            <div className={`mb-4 ${!canAccessFramework ? 'opacity-50' : ''}`}>
                <h3 className="text-xl font-semibold text-gray-700 mb-2 flex items-center">
                    <Layers className="mr-2" size={20} /> AI Model Protection
                </h3>
                <p className="text-yellow-800 font-medium">{modelProtectionStatus}</p>
            </div>

            <div className={`mb-4 ${!canAccessFramework ? 'opacity-50' : ''}`}>
                <h3 className="text-xl font-semibold text-gray-700 mb-2 flex items-center">
                    <Key className="mr-2" size={20} /> Zero-Trust Architecture
                </h3>
                <p className="text-yellow-800 font-medium">{zeroTrustStatus}</p>
            </div>

            <div className={`mb-4 ${!canAccessFramework ? 'opacity-50' : ''}`}>
                <h3 className="text-xl font-semibold text-gray-700 mb-2 flex items-center">
                    <Lock className="mr-2" size={20} /> End-to-End Encryption
                </h3>
                <p className="text-yellow-800 font-medium">{encryptionStatus}</p>
            </div>

            <button
                onClick={runSecurityScan}
                className={`px-6 py-3 font-medium rounded-lg transition duration-150 ease-in-out shadow-lg transform hover:scale-105 ${
                    canAccessFramework ? 'bg-yellow-600 text-white hover:bg-yellow-700' : 'bg-gray-400 text-gray-700 cursor-not-allowed'
                }`}
                disabled={!canAccessFramework}
            >
                <><ShieldCheck className="inline-block mr-2" size={20} /> Run Framework Security Scan</>
            </button>

            <div className="mt-6 text-sm text-gray-600 italic">
                <p>REPLACE: This module would involve continuous integration with Azure Security Center (Defender for Cloud), Azure Policy, Azure Kubernetes Service (AKS) for secure container deployments, and leveraging libraries like the Adversarial Robustness Toolbox within your Azure ML workflows. End-to-end encryption details would be managed via Azure Key Vault and network security groups.</p>
            </div>
        </div>
    );
};

// Innovative Cybersecurity Designs Module (Conceptual overview/landing page)
const InnovativeDesignsModule = () => {
    return (
        <div className="bg-purple-50 p-6 rounded-xl shadow-md border border-purple-200">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <GitFork className="mr-3" size={30} /> Innovative Cybersecurity Designs
            </h2>
            <p className="text-gray-700 mb-4">
                Our platform incorporates cutting-edge designs to stay ahead of evolving cyber threats, focusing on proactive defense mechanisms and advanced analytics.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-lg shadow-inner border border-purple-200 flex flex-col items-center text-center">
                    <Fingerprint className="text-purple-600 mb-3" size={40} />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Behavioral Biometrics</h3>
                    <p className="text-gray-600 text-sm">
                        Detecting anomalies in user interaction patterns for enhanced identity protection.
                    </p>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-inner border border-purple-200 flex flex-col items-center text-center">
                    <Globe className="text-purple-600 mb-3" size={40} />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Cyber Deception Technologies</h3>
                    <p className="text-gray-600 text-sm">
                        Luring and analyzing attackers with honeypots to gather threat intelligence.
                    </p>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-inner border border-purple-200 flex flex-col items-center text-center">
                    <ShieldAlert className="text-purple-600 mb-3" size={40} />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Secure AI Development Frameworks</h3>
                    <p className="text-gray-600 text-sm">
                        Protecting AI models from adversarial attacks and ensuring their integrity.
                    </p>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-inner border border-purple-200 flex flex-col items-center text-center">
                    <Cpu className="text-purple-600 mb-3" size={40} />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Homomorphic Encryption</h3>
                    <p className="text-gray-600 text-sm">
                        Processing sensitive data while it remains encrypted, preserving privacy.
                    </p>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-inner border border-purple-200 flex flex-col items-center text-center">
                    <Handshake className="text-purple-600 mb-3" size={40} />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Community-Driven Defense</h3>
                    <p className="text-gray-600 text-sm">
                        Leveraging collective intelligence for real-time scam and threat alerts.
                    </p>
                </div>
                <div className="bg-white p-5 rounded-lg shadow-inner border border-purple-200 flex flex-col items-center text-center">
                    <Settings className="text-purple-600 mb-3" size={40} />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Zero-Trust Architecture</h3>
                    <p className="text-gray-600 text-sm">
                        Strict identity verification and access controls for all resources.
                    </p>
                </div>
            </div>

            <div className="mt-6 text-sm text-gray-600 italic">
                <p>REPLACE: This section serves as an overview. Each design principle would have deeper integration across the various core modules, utilizing Azure's advanced security and AI capabilities.</p>
            </div>
        </div>
    );
};


// --- Dashboard Component ---
const Dashboard = () => {
    const { user, logout, userId, subscriptionLevel } = useAuth();
    const [securityTipPrompt, setSecurityTipPrompt] = useState('');
    const [alertExplanationPrompt, setAlertExplanationPrompt] = useState('');
    const [activeModule, setActiveModule] = useState('overview');

    useEffect(() => {
        if (user && user.securityScore) {
            let prompt = `Provide a concise cybersecurity tip for a user with a ${user.securityScore.score} security risk score. Focus on practical steps related to identity protection and secure authentication.`;
            if (user.securityScore.score === 'High Risk') {
                prompt += " Emphasize immediate actions to secure their account.";
            } else if (user.securityScore.score === 'Medium Risk') {
                prompt += " Suggest proactive measures to improve security posture.";
            } else {
                prompt += " Offer a general best practice for ongoing security awareness.";
            }
            setSecurityTipPrompt(prompt);
        }
    }, [user]);

    const handleGenerateMockAlert = useCallback(() => {
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
                const userScore = user?.securityScore?.score || 'Low Risk';
                const userDetails = user?.securityScore?.details || 'No significant behavioral anomalies detected.';

                return (
                    <>
                        {/* User Profile & Security Score */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div className="bg-indigo-50 p-6 rounded-lg shadow-md border border-indigo-200">
                                <h3 className="text-2xl font-semibold text-indigo-800 flex items-center mb-4">
                                    <User className="mr-2" size={24} /> User Profile
                                </h3>
                                {user && (
                                    <>
                                        <p className="text-gray-700 mb-2"><span className="font-medium">Username:</span> {user.username}</p>
                                        <p className="text-gray-700 mb-2 break-all"><span className="font-medium">User ID:</span> {userId}</p>
                                        <p className="text-gray-700 mb-2"><span className="font-medium">Role:</span> {user.role}</p>
                                        <p className="text-gray-700 mb-2"><span className="font-medium">Current Plan:</span> <span className="font-bold text-indigo-700">{SUBSCRIPTION_PLANS[subscriptionLevel]?.name}</span></p>
                                        {user.fullName && <p className="text-gray-700 mb-2"><span className="font-medium">Full Name:</span> {user.fullName}</p>}
                                        {user.dob && <p className="text-gray-700 mb-2"><span className="font-medium">Date of Birth:</span> {user.dob}</p>}
                                        {user.loginMethod && <p className="text-gray-700 mb-2"><span className="font-medium">Login Method:</span> {user.loginMethod}</p>}
                                        <p className="text-gray-700"><span className="font-medium">Last Login:</span> {user.lastLogin}</p>
                                    </>
                                )}
                            </div>

                            <div className={`p-6 rounded-lg shadow-md border ${
                                userScore === 'High Risk' ? 'bg-red-50 border-red-200' :
                                userScore === 'Medium Risk' ? 'bg-yellow-50 border-yellow-200' :
                                'bg-green-50 border-green-200'
                            }`}>
                                <h3 className={`text-2xl font-semibold flex items-center mb-4 ${
                                    userScore === 'High Risk' ? 'text-red-800' :
                                    userScore === 'Medium Risk' ? 'text-yellow-800' :
                                    'text-green-800'
                                }`}>
                                    {userScore === 'High Risk' && <AlertCircle className="mr-2" size={24} />}
                                    {userScore === 'Medium Risk' && <Info className="mr-2" size={24} />}
                                    {userScore === 'Low Risk' && <CheckCircle className="mr-2" size={24} />}
                                    AI Security Risk Score
                                </h3>
                                <p className={`text-5xl font-bold ${
                                    userScore === 'High Risk' ? 'text-red-600' :
                                    userScore === 'Medium Risk' ? 'text-yellow-600' :
                                    'text-green-600'
                                } mb-2`}>{userScore}</p>
                                <p className="text-gray-700">
                                    This score is based on your recent login behavior and simulated AI analysis.
                                    A higher score indicates potential anomalies.
                                </p>
                                {userDetails && userDetails !== 'No significant behavioral anomalies detected.' && (
                                     <p className="text-red-700 font-semibold mt-2">
                                        <Info className="inline-block mr-1" size={16} /> Details: {userDetails}
                                    </p>
                                )}
                                {userScore === 'High Risk' && (
                                    <p className="text-red-700 font-semibold mt-2">
                                        <AlertCircle className="inline-block mr-1" size={16} /> Immediate action may be required.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* AI-generated Security Tip */}
                        <div className="bg-blue-50 p-6 rounded-lg shadow-md mb-8 border border-blue-200">
                            <h3 className="text-2xl font-semibold text-blue-800 flex items-center mb-4">
                                <MessageSquareText className="mr-2" size={24} /> AI Security Insights
                            </h3>
                            <AIChatbot prompt={securityTipPrompt} />
                        </div>

                        {/* Mock Security Alert Generator */}
                        <div className="bg-purple-50 p-6 rounded-lg shadow-md border border-purple-200">
                            <h3 className="text-2xl font-semibold text-purple-800 mb-4 flex items-center">
                                <AlertCircle className="mr-2" size={24} /> Simulate Security Alert
                            </h3>
                            <p className="text-gray-700 mb-4">
                                Click the button below to generate a mock security alert and get an AI explanation on how to respond.
                            </p>
                            <button
                                onClick={handleGenerateMockAlert}
                                className="px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition duration-150 ease-in-out shadow-lg transform hover:scale-105"
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 p-4">
                <div className="text-white text-center">
                    <p className="text-xl font-semibold">Access Denied. Please log in.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-sans flex">
            {/* Sidebar Navigation */}
            <nav className="w-64 bg-gray-800 text-white p-4 rounded-xl shadow-lg mr-6 flex-shrink-0">
                <div className="flex items-center mb-6 pb-4 border-b border-gray-700">
                    <ShieldCheck className="h-10 w-10 text-indigo-400 mr-3" />
                    <span className="text-2xl font-bold">SyncBridge</span>
                </div>
                <ul className="space-y-2">
                    <li>
                        <button
                            onClick={() => setActiveModule('overview')}
                            className={`flex items-center w-full px-4 py-2 rounded-lg text-left transition duration-150 ease-in-out ${activeModule === 'overview' ? 'bg-indigo-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                        >
                            <User className="mr-3" size={20} /> Dashboard Overview
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('fraud-detection')}
                            className={`flex items-center w-full px-4 py-2 rounded-lg text-left transition duration-150 ease-in-out ${activeModule === 'fraud-detection' && allowedModules.includes('fraud-detection') ? 'bg-indigo-700 text-white' : 'hover:bg-gray-700 text-gray-300'} ${!allowedModules.includes('fraud-detection') ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={!allowedModules.includes('fraud-detection')}
                        >
                            <Brain className="mr-3" size={20} /> AI Fraud Detection
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('threat-intel')}
                            className={`flex items-center w-full px-4 py-2 rounded-lg text-left transition duration-150 ease-in-out ${activeModule === 'threat-intel' && allowedModules.includes('threat-intel') ? 'bg-indigo-700 text-white' : 'hover:bg-gray-700 text-gray-300'} ${!allowedModules.includes('threat-intel') ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={!allowedModules.includes('threat-intel')}
                        >
                            <Bell className="mr-3" size={20} /> Threat Intel & Monitoring
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('scam-prevention')}
                            className={`flex items-center w-full px-4 py-2 rounded-lg text-left transition duration-150 ease-in-out ${activeModule === 'scam-prevention' && allowedModules.includes('scam-prevention') ? 'bg-indigo-700 text-white' : 'hover:bg-gray-700 text-gray-300'} ${!allowedModules.includes('scam-prevention') ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={!allowedModules.includes('scam-prevention')}
                        >
                            <Book className="mr-3" size={20} /> Scam Prevention & Edu.
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('ai-dev-framework')}
                            className={`flex items-center w-full px-4 py-2 rounded-lg text-left transition duration-150 ease-in-out ${activeModule === 'ai-dev-framework' && allowedModules.includes('ai-dev-framework') ? 'bg-indigo-700 text-white' : 'hover:bg-gray-700 text-gray-300'} ${!allowedModules.includes('ai-dev-framework') ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={!allowedModules.includes('ai-dev-framework')}
                        >
                            <Code className="mr-3" size={20} /> Secure AI Dev Framework
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => setActiveModule('innovative-designs')}
                            className={`flex items-center w-full px-4 py-2 rounded-lg text-left transition duration-150 ease-in-out ${activeModule === 'innovative-designs' && allowedModules.includes('innovative-designs') ? 'bg-indigo-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                        >
                            <GitFork className="mr-3" size={20} /> Innovative Designs
                        </button>
                    </li>
                    <li className="pt-4 border-t border-gray-700 mt-4">
                        <button
                            onClick={logout}
                            className="flex items-center w-full px-4 py-2 rounded-lg text-left text-red-400 hover:bg-gray-700 transition duration-150 ease-in-out"
                        >
                            <LogOut className="mr-3" size={20} /> Log Out
                        </button>
                    </li>
                </ul>
            </nav>

            {/* Main Content Area */}
            <div className="flex-1 p-6 bg-white rounded-xl shadow-2xl border border-gray-200">
                {renderActiveModule()}
            </div>
        </div>
    );
};


// --- Main App Component (AuthRouter) ---
// Manages routing between Welcome, Get Started, Login/Signup, Profile Setup, Pricing, Payment, and Dashboard
const AuthRouter = () => {
    const { isLoggedIn, isAuthReady, subscriptionLevel, needsProfileCompletion } = useAuth();
    const [currentView, setCurrentView] = useState('welcome'); // Initial view is 'welcome'
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);

    useEffect(() => {
        if (isAuthReady) {
            if (isLoggedIn) {
                if (needsProfileCompletion) {
                    setCurrentView('profileSetup');
                } else if (subscriptionLevel === 'free') {
                    setCurrentView('pricing'); // Redirect free users to pricing to encourage upgrade or proceed with free
                } else {
                    setCurrentView('dashboard');
                }
            } else {
                // If not logged in, ensure we are on a public entry point
                if (!['welcome', 'getStarted', 'loginSignupChoice', 'login', 'signup'].includes(currentView)) {
                    setCurrentView('welcome');
                }
            }
        }
    }, [isLoggedIn, isAuthReady, subscriptionLevel, needsProfileCompletion]);

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

    const simulateSocialLogin = useCallback((method) => {
        console.log(`Simulating login with ${method}`);
        auth.signInAnonymously().then(async (userCredential) => {
            const uid = userCredential.user.uid;
            const userRef = doc(db, `artifacts/${appId}/users/${uid}/profiles`, 'userProfile');
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                const defaultProfile = {
                    username: `${method}_user_${uid.substring(0, 8)}@mock.com`,
                    role: 'new_user',
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toLocaleString(),
                    behavioralBaseline: { avgTypingSpeed: 150, avgPasswordTypingSpeed: 100, totalMouseDistance: 5000, mouseClickCount: 20 },
                    securityScore: { score: 'Low Risk', details: 'Initial assessment.' },
                    subscription: 'free',
                    fullName: '',
                    dob: '',
                    securityQuestions: [],
                    loginMethod: method,
                };
                console.log(`Attempting to set social login profile for UID: ${uid} at path: ${userRef.path}`);
                await setDoc(userRef, defaultProfile);
                console.log("Social login profile document set successfully.");
                setCurrentView('profileSetup');
            } else {
                const userData = userSnap.data();
                if (!(userData.fullName && userData.dob && userData.securityQuestions && userData.securityQuestions.length > 0)) {
                    setCurrentView('profileSetup');
                } else if (userData.subscription === 'free') {
                    setCurrentView('pricing');
                } else {
                    setCurrentView('dashboard');
                }
            }
        }).catch(error => {
            console.error("Mock social login failed:", error);
        });

    }, [appId]);


    if (!isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 p-4">
                <div className="text-white text-center flex flex-col items-center">
                    <Loader2 className="animate-spin h-10 w-10 text-white mb-4" />
                    <p className="text-xl font-semibold">Loading authentication services...</p>
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


// --- Top-Level App Component ---
// This is the main component that will be rendered by the React environment.
// It wraps the AuthRouter in AuthProvider.
export default function App() {
    return (
        <AuthProvider>
            <AuthRouter />
        </AuthProvider>
    );
}
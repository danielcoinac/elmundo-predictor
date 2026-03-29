import React from "react";

export const TRANSLATIONS = {
  en: {
    // Auth
    signIn:"Sign In", register:"Register", email:"Email Address", password:"Password",
    fullName:"Full Name", phone:"Phone Number", signInBtn:"SIGN IN", registerBtn:"REGISTER",
    dontHaveAccount:"Don't have an account?", alreadyHaveAccount:"Already have an account?",
    registerHere:"Register here", signInHere:"Sign in here",
    // Nav
    matches:"Matches", leaderboard:"Leaderboard", menu:"Menu", rules:"Rules",
    profile:"Profile", admin:"Admin",
    // Menu tabs
    menuTab:"Menu", cartTab:"Cart", ordersTab:"Orders", walletTab:"Wallet", groupTab:"Group",
    // Menu
    addToCart:"ADD", viewCart:"View Cart", browseMenu:"BROWSE MENU",
    itemsLabel:"items", noMenu:"Menu not available right now",
    // Cart
    yourCart:"Your cart", emptyCart:"Your cart is empty",
    selectTable:"SELECT YOUR TABLE", payment:"PAYMENT",
    payWithCredits:"💳 CREDITS",
    placeOrder:"PLACE ORDER", placing:"PLACING...",
    total:"TOTAL", selectedTable:"Selected: Table",
    // Orders
    noOrders:"No orders yet", pending:"⏳ Pending", confirmed:"✓ Confirmed",
    ready:"🔔 Ready!", delivered:"Delivered", printReceipt:"PRINT RECEIPT",
    // Wallet
    creditBalance:"CREDIT BALANCE", topUp:"+ TOP UP", useCredits:"Use credits to pay for orders",
    selectAmount:"SELECT AMOUNT",
    // Group
    groupOrder:"GROUP ORDER", orderTogether:"Order together, pay your way",
    startGroup:"+ START GROUP ORDER", joinWithCode:"JOIN WITH CODE",
    createGroup:"CREATE GROUP", joinGroup:"JOIN GROUP",
    tableNumber:"TABLE NUMBER", yourName:"YOUR NAME",
    back:"← Back", lobby:"Lobby", checkout:"CHECKOUT",
    paymentMode:"PAYMENT MODE", splitBill:"SPLIT BILL", hostPaysAll:"HOST PAYS ALL",
    proceedToCheckout:"PROCEED TO CHECKOUT →",
    waitingForHost:"Waiting for host to start checkout…",
    // Predictions
    predictScore:"Predict score", savePred:"SAVE", saved:"Saved ✓",
    // Profile
    yourStats:"YOUR STATS", points:"pts", predictions:"predictions",
    accuracy:"accuracy", rank:"rank", yourPredictions:"YOUR PREDICTIONS",
    // General
    loading:"Loading…", save:"Save", cancel:"Cancel", close:"Close",
    delete:"Delete", edit:"EDIT", show:"SHOW", hide:"HIDE",
    confirmDelete:"Are you sure you want to delete this?",
    notEnoughCredits:"Not enough credits",
    orderPlaced:"Order placed! 🍺 The bar will prepare it shortly.",
    welcomeBack:"Welcome back",
  },
  nl: {
    // Auth
    signIn:"Inloggen", register:"Registreren", email:"E-mailadres", password:"Wachtwoord",
    fullName:"Volledige naam", phone:"Telefoonnummer", signInBtn:"INLOGGEN", registerBtn:"REGISTREREN",
    dontHaveAccount:"Nog geen account?", alreadyHaveAccount:"Al een account?",
    registerHere:"Registreer hier", signInHere:"Log hier in",
    // Nav
    matches:"Wedstrijden", leaderboard:"Ranglijst", menu:"Menu", rules:"Regels",
    profile:"Profiel", admin:"Admin",
    // Menu tabs
    menuTab:"Menu", cartTab:"Winkelwagen", ordersTab:"Bestellingen", walletTab:"Portemonnee", groupTab:"Groep",
    // Menu
    addToCart:"ADD", viewCart:"Winkelwagen", browseMenu:"BEKIJK MENU",
    itemsLabel:"items", noMenu:"Menu momenteel niet beschikbaar",
    // Cart
    yourCart:"Uw winkelwagen", emptyCart:"Uw winkelwagen is leeg",
    selectTable:"KIES UW TAFEL", payment:"BETALING",
    payWithCredits:"💳 CREDITS",
    placeOrder:"BESTELLING PLAATSEN", placing:"BEZIG...",
    total:"TOTAAL", selectedTable:"Geselecteerd: Tafel",
    // Orders
    noOrders:"Nog geen bestellingen", pending:"⏳ In behandeling", confirmed:"✓ Bevestigd",
    ready:"🔔 Klaar!", delivered:"Bezorgd", printReceipt:"BON AFDRUKKEN",
    // Wallet
    creditBalance:"CREDITSALDO", topUp:"+ OPLADEN", useCredits:"Gebruik credits om te betalen",
    selectAmount:"KIES BEDRAG",
    // Group
    groupOrder:"GROEPSBESTELLING", orderTogether:"Samen bestellen, op jouw manier betalen",
    startGroup:"+ GROEPSBESTELLING STARTEN", joinWithCode:"DEELNEMEN MET CODE",
    createGroup:"GROEP AANMAKEN", joinGroup:"GROEP DEELNEMEN",
    tableNumber:"TAFELNUMMER", yourName:"UW NAAM",
    back:"← Terug", lobby:"Lobby", checkout:"AFREKENEN",
    paymentMode:"BETALINGSWIJZE", splitBill:"REKENING SPLITSEN", hostPaysAll:"GASTHEER BETAALT ALLES",
    proceedToCheckout:"VERDER NAAR AFREKENEN →",
    waitingForHost:"Wachten tot de gastheer het afrekenen start…",
    // Predictions
    predictScore:"Score voorspellen", savePred:"OPSLAAN", saved:"Opgeslagen ✓",
    // Profile
    yourStats:"UW STATISTIEKEN", points:"pts", predictions:"voorspellingen",
    accuracy:"nauwkeurigheid", rank:"rang", yourPredictions:"UW VOORSPELLINGEN",
    // General
    loading:"Laden…", save:"Opslaan", cancel:"Annuleren", close:"Sluiten",
    delete:"Verwijderen", edit:"BEWERKEN", show:"TONEN", hide:"VERBERGEN",
    confirmDelete:"Weet u zeker dat u dit wilt verwijderen?",
    notEnoughCredits:"Niet genoeg credits",
    orderPlaced:"Bestelling geplaatst! 🍺 De bar bereidt het zo snel mogelijk.",
    welcomeBack:"Welkom terug",
  },
};

export const LangContext = React.createContext({ lang:"en", t: k => TRANSLATIONS.en[k] || k });
export function useLang() { return React.useContext(LangContext); }

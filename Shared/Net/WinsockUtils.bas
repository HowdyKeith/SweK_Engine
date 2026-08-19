Attribute VB_Name = "WinsockUtils"
'816

Option Explicit

'***************************************************************
' winsockUtils Module
' Purpose: Tests Winsock functionality and outputs results to Immediate Window
' Features: WSAStartup/WSACleanup, socket creation, bind, listen, accept,
'           send/recv, setsockopt, error handling
' Usage: Call TestWinsock to run all tests
'***************************************************************

#If VBA7 Then
    Private Declare PtrSafe Function WSAStartup Lib "ws2_32.dll" (ByVal wVersionRequested As Long, lpWSAData As wsaData) As Long
    Private Declare PtrSafe Function WSACleanup Lib "ws2_32.dll" () As Long
    Private Declare PtrSafe Function socket Lib "ws2_32.dll" (ByVal af As Long, ByVal sType As Long, ByVal protocol As Long) As Long
    Private Declare PtrSafe Function bind Lib "ws2_32.dll" (ByVal s As Long, addr As sockaddr_in, ByVal namelen As Long) As Long
    Private Declare PtrSafe Function listen Lib "ws2_32.dll" (ByVal s As Long, ByVal backlog As Long) As Long
    Private Declare PtrSafe Function accept Lib "ws2_32.dll" (ByVal s As Long, ByVal addr As Any, ByVal addrLen As Any) As Long
    Private Declare PtrSafe Function closesocket Lib "ws2_32.dll" (ByVal s As Long) As Long
    Private Declare PtrSafe Function recv Lib "ws2_32.dll" (ByVal s As Long, ByVal buf As String, ByVal buflen As Long, ByVal flags As Long) As Long
    Private Declare PtrSafe Function send Lib "ws2_32.dll" (ByVal s As Long, ByVal buf As String, ByVal buflen As Long, ByVal flags As Long) As Long
    Private Declare PtrSafe Function ioctlsocket Lib "ws2_32.dll" (ByVal s As Long, ByVal cmd As Long, argp As Long) As Long
    Private Declare PtrSafe Function setsockopt Lib "ws2_32.dll" (ByVal s As Long, ByVal Level As Long, ByVal optname As Long, ByRef optval As Long, ByVal optlen As Long) As Long
    Private Declare PtrSafe Function WSAGetLastError Lib "ws2_32.dll" () As Long
    Private Declare PtrSafe Function inet_addr Lib "ws2_32.dll" (ByVal cp As String) As Long
    Private Declare PtrSafe Function htons Lib "ws2_32.dll" (ByVal hostshort As Long) As Integer
#Else
    Private Declare Function WSAStartup Lib "ws2_32.dll" (ByVal wVersionRequested As Long, lpWSAData As wsaData) As Long
    Private Declare Function WSACleanup Lib "ws2_32.dll" () As Long
    Private Declare Function socket Lib "ws2_32.dll" (ByVal af As Long, ByVal sType As Long, ByVal Protocol As Long) As Long
    Private Declare Function bind Lib "ws2_32.dll" (ByVal s As Long, addr As SOCKADDR_IN, ByVal namelen As Long) As Long
    Private Declare Function listen Lib "ws2_32.dll" (ByVal s As Long, ByVal backlog As Long) As Long
    Private Declare Function accept Lib "ws2_32.dll" (ByVal s As Long, ByVal addr As Any, ByVal addrLen As Any) As Long
    Private Declare Function closesocket Lib "ws2_32.dll" (ByVal s As Long) As Long
    Private Declare Function recv Lib "ws2_32.dll" (ByVal s As Long, ByVal buf As String, ByVal buflen As Long, ByVal flags As Long) As Long
    Private Declare Function send Lib "ws2_32.dll" (ByVal s As Long, ByVal buf As String, ByVal buflen As Long, ByVal flags As Long) As Long
    Private Declare Function ioctlsocket Lib "ws2_32.dll" (ByVal s As Long, ByVal cmd As Long, argp As Long) As Long
    Private Declare Function setsockopt Lib "ws2_32.dll" (ByVal s As Long, ByVal level As Long, ByVal optname As Long, ByRef optval As Long, ByVal optlen As Long) As Long
    Private Declare Function WSAGetLastError Lib "ws2_32.dll" () As Long
    Private Declare Function inet_addr Lib "ws2_32.dll" (ByVal cp As String) As Long
    Private Declare Function htons Lib "ws2_32.dll" (ByVal hostshort As Long) As Integer
#End If

'***************************************************************
' Types
'***************************************************************
Private Type wsaData
    wVersion As Integer
    wHighVersion As Integer
    szDescription(0 To 255) As Byte
    szSystemStatus(0 To 127) As Byte
    iMaxSockets As Integer
    iMaxUdpDg As Integer
    lpVendorInfo As Long
End Type

Private Type sockaddr_in
    sin_family As Integer
    sin_port As Integer
    sin_addr As Long
    sin_zero As String * 8
End Type

'***************************************************************
' Constants
'***************************************************************
Private Const AF_INET As Long = 2
Private Const SOCK_STREAM As Long = 1
Private Const IPPROTO_TCP As Long = 6
Private Const SOL_SOCKET As Long = &HFFFF&
Private Const SO_REUSEADDR As Long = &H4
Private Const INVALID_SOCKET As Long = -1
Private Const SOCKET_ERROR As Long = -1
Private Const FIONBIO As Long = &H8004667E
Private Const WSAEWOULDBLOCK As Long = 10035
Private Const MAX_CLIENTS As Long = 50
Private Const CLIENT_TIMEOUT As Long = 30000
Private Const BUFFER_SIZE As Long = 8192
Private Const TEST_PORT As Long = 8081  ' Use a different port for testing to avoid conflicts

'***************************************************************
' Module Variables
'***************************************************************
Private testSocket As Long
Private testClientSocket As Long
Private testServerSocket As Long
Private wsaInitialized As Boolean

'***************************************************************
' Main Test Function
'***************************************************************
Public Sub TestWinsock()
    Debug.Print "=== Winsock Testing Started ==="
    Debug.Print "Current Date: " & format(Now, "yyyy-mm-dd hh:mm:ss")
    Debug.Print "VBA Version: " & Application.version
    Debug.Print "Excel Version: " & Application.version & " (Build " & Application.Build & ")"
    Debug.Print ""
    
    wsaInitialized = False
    testSocket = INVALID_SOCKET
    testClientSocket = INVALID_SOCKET
    testServerSocket = INVALID_SOCKET
    
    ' Test 1: WSAStartup and WSACleanup
    Debug.Print "Test 1: WSAStartup and WSACleanup"
    If TestWSAStartupCleanup Then
        Debug.Print "  [PASS] WSAStartup/WSACleanup successful"
    Else
        Debug.Print "  [FAIL] WSAStartup/WSACleanup failed"
    End If
    Debug.Print ""
    
    ' Test 2: Socket Creation
    Debug.Print "Test 2: Socket Creation"
    If TestSocketCreation Then
        Debug.Print "  [PASS] Socket creation successful"
    Else
        Debug.Print "  [FAIL] Socket creation failed"
    End If
    Debug.Print ""
    
    ' Test 3: Bind to Port
    Debug.Print "Test 3: Bind to Port"
    If TestBindSocket Then
        Debug.Print "  [PASS] Socket bind successful"
    Else
        Debug.Print "  [FAIL] Socket bind failed"
    End If
    Debug.Print ""
    
    ' Test 4: Listen on Socket
    Debug.Print "Test 4: Listen on Socket"
    If TestListenSocket Then
        Debug.Print "  [PASS] Socket listen successful"
    Else
        Debug.Print "  [FAIL] Socket listen failed"
    End If
    Debug.Print ""
    
    ' Test 5: Accept Connection
    Debug.Print "Test 5: Accept Connection"
    If TestAcceptConnection Then
        Debug.Print "  [PASS] Socket accept successful"
    Else
        Debug.Print "  [FAIL] Socket accept failed"
    End If
    Debug.Print ""
    
    ' Test 6: Send/Recv Data
    Debug.Print "Test 6: Send/Recv Data"
    If TestSendRecv Then
        Debug.Print "  [PASS] Send/Recv successful"
    Else
        Debug.Print "  [FAIL] Send/Recv failed"
    End If
    Debug.Print ""
    
    ' Test 7: Setsockopt (SO_REUSEADDR)
    Debug.Print "Test 7: Setsockopt (SO_REUSEADDR)"
    If TestSetsockoptReuseAddr Then
        Debug.Print "  [PASS] SO_REUSEADDR setsockopt successful"
    Else
        Debug.Print "  [FAIL] SO_REUSEADDR setsockopt failed"
    End If
    Debug.Print ""
    
    ' Test 8: Non-blocking I/O (FIONBIO)
    Debug.Print "Test 8: Non-blocking I/O (FIONBIO)"
    If TestNonBlockingIO Then
        Debug.Print "  [PASS] Non-blocking I/O successful"
    Else
        Debug.Print "  [FAIL] Non-blocking I/O failed"
    End If
    Debug.Print ""
    
    ' Test 9: Error Handling (WSAGetLastError)
    Debug.Print "Test 9: Error Handling (WSAGetLastError)"
    If TestErrorHandling Then
        Debug.Print "  [PASS] Error handling successful"
    Else
        Debug.Print "  [FAIL] Error handling test failed"
    End If
    Debug.Print ""
    
    ' Test 10: Inet_addr and htons
    Debug.Print "Test 10: Inet_addr and htons"
    If TestInetAddrHtons Then
        Debug.Print "  [PASS] Inet_addr and htons successful"
    Else
        Debug.Print "  [FAIL] Inet_addr and htons failed"
    End If
    Debug.Print ""
    
    ' Cleanup
    CleanupTestResources
    
    Debug.Print "=== Winsock Testing Completed ==="
    Debug.Print "Summary: 10 tests executed. Check individual results above."
End Sub

'***************************************************************
' Test Functions
'***************************************************************

Private Function TestWSAStartupCleanup() As Boolean
    On Error GoTo fail
    Dim wsa As wsaData
    If WSAStartup(&H202, wsa) = 0 Then
        If WSACleanup = 0 Then
            TestWSAStartupCleanup = True
            Exit Function
        End If
    End If
fail:
    TestWSAStartupCleanup = False
End Function

Private Function TestSocketCreation() As Boolean
    On Error GoTo fail
    If InitializeWinsock Then
        testSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        If testSocket <> INVALID_SOCKET Then
            TestSocketCreation = True
            Exit Function
        End If
    End If
fail:
    TestSocketCreation = False
End Function

Private Function TestBindSocket() As Boolean
    On Error GoTo fail
    If TestSocketCreation Then
        Dim addr As sockaddr_in
        addr.sin_family = AF_INET
        addr.sin_port = htons(TEST_PORT)
        addr.sin_addr = inet_addr("127.0.0.1")
        If bind(testSocket, addr, LenB(addr)) = 0 Then
            TestBindSocket = True
            Exit Function
        End If
    End If
fail:
    TestBindSocket = False
End Function

Private Function TestListenSocket() As Boolean
    On Error GoTo fail
    If TestBindSocket Then
        If listen(testSocket, 5) = 0 Then
            TestListenSocket = True
            Exit Function
        End If
    End If
fail:
    TestListenSocket = False
End Function

Private Function TestAcceptConnection() As Boolean
    On Error GoTo fail
    If TestListenSocket Then
        ' Create a test client socket to connect
        Dim clientSocket As Long
        clientSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        If clientSocket <> INVALID_SOCKET Then
            Dim clientAddr As sockaddr_in
            clientAddr.sin_family = AF_INET
            clientAddr.sin_port = 0 ' Any port
            clientAddr.sin_addr = inet_addr("127.0.0.1")
            bind clientSocket, clientAddr, LenB(clientAddr)
            Connect clientSocket, clientAddr, LenB(clientAddr) ' Connect to server
            
            ' Accept on server
            testClientSocket = accept(testSocket, ByVal 0&, ByVal 0&)
            If testClientSocket <> INVALID_SOCKET Then
                closesocket clientSocket
                TestAcceptConnection = True
                Exit Function
            End If
            closesocket clientSocket
        End If
    End If
fail:
    TestAcceptConnection = False
End Function

Private Function TestSendRecv() As Boolean
    On Error GoTo fail
    If TestAcceptConnection Then
        Dim testMessage As String
        testMessage = "Hello, Winsock!"
        Dim bytes As Long
        bytes = send(testClientSocket, testMessage, Len(testMessage), 0)
        If bytes = Len(testMessage) Then
            Dim recvBuffer As String * 100
            Dim recvBytes As Long
            recvBytes = recv(testClientSocket, recvBuffer, Len(recvBuffer), 0)
            If recvBytes > 0 And Left(recvBuffer, Len(testMessage)) = testMessage Then
                TestSendRecv = True
                Exit Function
            End If
        End If
        closesocket testClientSocket
        testClientSocket = INVALID_SOCKET
    End If
fail:
    TestSendRecv = False
End Function

Private Function TestSetsockoptReuseAddr() As Boolean
    On Error GoTo fail
    If TestSocketCreation Then
        Dim optval As Long: optval = 1
        If setsockopt(testSocket, SOL_SOCKET, SO_REUSEADDR, optval, LenB(optval)) = 0 Then
            TestSetsockoptReuseAddr = True
            Exit Function
        End If
    End If
fail:
    TestSetsockoptReuseAddr = False
End Function

Private Function TestNonBlockingIO() As Boolean
    On Error GoTo fail
    If TestSocketCreation Then
        Dim nonBlocking As Long: nonBlocking = 1
        If ioctlsocket(testSocket, FIONBIO, nonBlocking) = 0 Then
            TestNonBlockingIO = True
            Exit Function
        End If
    End If
fail:
    TestNonBlockingIO = False
End Function

Private Function TestErrorHandling() As Boolean
    On Error GoTo fail
    Dim errorCode As Long
    errorCode = WSAGetLastError
    If errorCode >= 0 And errorCode <= 10000 Then ' Reasonable range for Winsock errors
        TestErrorHandling = True
        Exit Function
    End If
fail:
    TestErrorHandling = False
End Function

Private Function TestInetAddrHtons() As Boolean
    On Error GoTo fail
    Dim ipAddr As Long
    ipAddr = inet_addr("127.0.0.1")
    If ipAddr <> SOCKET_ERROR Then
        Dim portShort As Integer
        portShort = htons(8080)
        If portShort > 0 Then
            TestInetAddrHtons = True
            Exit Function
        End If
    End If
fail:
    TestInetAddrHtons = False
End Function

'***************************************************************
' Helper Functions
'***************************************************************
Private Function InitializeWinsock() As Boolean
    On Error GoTo fail
    If Not wsaInitialized Then
        Dim wsa As wsaData
        If WSAStartup(&H202, wsa) = 0 Then
            wsaInitialized = True
            InitializeWinsock = True
            Exit Function
        End If
    Else
        InitializeWinsock = True
        Exit Function
    End If
fail:
    InitializeWinsock = False
End Function

Private Sub CleanupTestResources()
    On Error Resume Next
    If testSocket <> INVALID_SOCKET Then closesocket testSocket
    If testClientSocket <> INVALID_SOCKET Then closesocket testClientSocket
    If testServerSocket <> INVALID_SOCKET Then closesocket testServerSocket
    If wsaInitialized Then WSACleanup
    wsaInitialized = False
    testSocket = INVALID_SOCKET
    testClientSocket = INVALID_SOCKET
    testServerSocket = INVALID_SOCKET
    Debug.Print "[winsockUtils] Test resources cleaned up"
End Sub


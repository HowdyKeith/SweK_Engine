Attribute VB_Name = "WinsockDeclares"
Option Explicit

'============================================================
' Module: WinsockDeclares
' Purpose: Winsock API declarations for socket operations
' Compatibility: 32-bit and 64-bit VBA (Office)
' Notes:
' - Uses LongPtr for socket handles in 64-bit VBA (VBA7)
' - Provides structures (sockaddr_in, fd_set, timeval, WSADATA, ip_mreq)
' - Includes client & server APIs (socket, bind, connect, listen, accept)
' - Provides select(), setsockopt(), send/recv, etc.
   ' Purpose: Winsock API declarations for MDNSNative.bas
   ' Notes: Includes IPv6 support
   '============================================================

   #If VBA7 Then
       Public Declare PtrSafe Function socket Lib "ws2_32.dll" (ByVal af As Long, ByVal s_type As Long, ByVal protocol As Long) As LongPtr
       Public Declare PtrSafe Function setsockopt Lib "ws2_32.dll" (ByVal s As LongPtr, ByVal Level As Long, ByVal optname As Long, optval As Any, ByVal optlen As Long) As Long
       Public Declare PtrSafe Function bind Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef addr As Any, ByVal namelen As Long) As Long
       Public Declare PtrSafe Function sendto Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef buf As Any, ByVal Length As Long, ByVal flags As Long, ByRef toaddr As Any, ByVal tolen As Long) As Long
       Public Declare PtrSafe Function recvfrom Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef buf As Any, ByVal Length As Long, ByVal flags As Long, ByRef fromaddr As Any, ByRef fromlen As Long) As Long
       Public Declare PtrSafe Function closesocket Lib "ws2_32.dll" (ByVal s As LongPtr) As Long
       Public Declare PtrSafe Function Connect Lib "ws2_32.dll" Alias "connect" (ByVal s As LongPtr, ByRef addr As Any, ByVal namelen As Long) As Long
       Public Declare PtrSafe Function getsockname Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef Name As Any, ByRef namelen As Long) As Long
       Public Declare PtrSafe Function inet_addr Lib "ws2_32.dll" (ByVal cp As String) As Long
       Public Declare PtrSafe Function inet_ntoa Lib "ws2_32.dll" (ByVal inaddr As Long) As String
       Public Declare PtrSafe Function inet_pton Lib "ws2_32.dll" (ByVal af As Long, ByVal src As String, ByRef dst As Any) As Long
       Public Declare PtrSafe Function htons Lib "ws2_32.dll" (ByVal hostshort As Integer) As Integer
       Public Declare PtrSafe Function WSAGetLastError Lib "ws2_32.dll" () As Long
   #Else
       Public Declare Function socket Lib "ws2_32.dll" Alias "socket" (ByVal af As Long, ByVal s_type As Long, ByVal protocol As Long) As Long
       Public Declare Function setsockopt Lib "ws2_32.dll" Alias "setsockopt" (ByVal s As Long, ByVal level As Long, ByVal optname As Long, optval As Any, ByVal optlen As Long) As Long
       Public Declare Function bind Lib "ws2_32.dll" Alias "bind" (ByVal s As Long, ByRef addr As Any, ByVal namelen As Long) As Long
       Public Declare Function sendto Lib "ws2_32.dll" Alias "sendto" (ByVal s As Long, ByRef buf As Any, ByVal length As Long, ByVal flags As Long, ByRef toaddr As Any, ByVal tolen As Long) As Long
       Public Declare Function recvfrom Lib "ws2_32.dll" Alias "recvfrom" (ByVal s As Long, ByRef buf As Any, ByVal length As Long, ByVal flags As Long, ByRef fromaddr As Any, ByRef fromlen As Long) As Long
       Public Declare Function closesocket Lib "ws2_32.dll" Alias "closesocket" (ByVal s As Long) As Long
       Public Declare Function connect Lib "ws2_32.dll" Alias "connect" (ByVal s As Long, ByRef addr As Any, ByVal namelen As Long) As Long
       Public Declare Function getsockname Lib "ws2_32.dll" Alias "getsockname" (ByVal s As Long, ByRef name As Any, ByRef namelen As Long) As Long
       Public Declare Function inet_addr Lib "ws2_32.dll" Alias "inet_addr" (ByVal cp As String) As Long
       Public Declare Function inet_ntoa Lib "ws2_32.dll" Alias "inet_ntoa" (ByVal inaddr As Long) As String
       Public Declare Function inet_pton Lib "ws2_32.dll" Alias "inet_pton" (ByVal af As Long, ByVal src As String, ByRef dst As Any) As Long
       Public Declare Function htons Lib "ws2_32.dll" Alias "htons" (ByVal hostshort As Integer) As Integer
       Public Declare Function WSAGetLastError Lib "ws2_32.dll" Alias "WSAGetLastError" () As Long
   #End If

   Public Const AF_INET As Long = 2
   Public Const AF_INET6 As Long = 23
   Public Const SOCK_DGRAM As Long = 2
   Public Const IPPROTO_UDP As Long = 17
   Public Const SOL_SOCKET As Long = &HFFFF&
   Public Const SO_REUSEADDR As Long = &H4
   Public Const IPPROTO_IP As Long = 0
   Public Const IP_ADD_MEMBERSHIP As Long = 12
   Public Const IPPROTO_IPV6 As Long = 41
   Public Const IPV6_ADD_MEMBERSHIP As Long = 12
   Public Const INVALID_SOCKET As Long = -1
   Public Const SOCKET_ERROR As Long = -1

   Public Type sockaddr_in
       sin_family As Integer
       sin_port As Integer
       sin_addr As Long
       sin_zero(0 To 7) As Byte
   End Type

   Public Type sockaddr_in6
       sin6_family As Integer
       sin6_port As Integer
       sin6_flowinfo As Long
       sin6_addr(0 To 15) As Byte
       sin6_scope_id As Long
   End Type

   Public Type ip_mreq
       imr_multiaddr As Long
       imr_interface As Long
   End Type

   Public Type ipv6_mreq
       ipv6mr_multiaddr(0 To 15) As Byte
       ipv6mr_interface As Long
   End Type



#If VBA7 Then
Public Declare PtrSafe Function gethostbyname Lib "ws2_32.dll" ( _
        ByVal hostName As String) As LongPtr
    
    Public Declare PtrSafe Sub RtlMoveMemory Lib "kernel32" ( _
        ByRef Destination As Any, _
        ByVal Source As Any, _
        ByVal Length As Long)
    ' timeval structure
    Public Type timeval
        tv_sec As Long
        tv_usec As Long
    End Type

    ' fd_set
    Public Const FD_SETSIZE As Long = 64
    Public Type fd_set
        fd_count As Long
        fd_array(FD_SETSIZE - 1) As LongPtr
    End Type

    ' Winsock API declarations (64-bit safe)
    Public Declare PtrSafe Function VBSelect Lib "ws2_32.dll" Alias "select" ( _
        ByVal nfds As Long, _
        ByRef readfds As fd_set, _
        ByRef writefds As fd_set, _
        ByRef exceptfds As fd_set, _
        ByRef timeout As timeval) As Long

    
    Public Declare PtrSafe Function gethostname Lib "ws2_32.dll" (ByVal Name As String, ByVal namelen As Long) As Long
    
    
    
    Public Declare PtrSafe Function ioctlsocket Lib "ws2_32.dll" (ByVal s As LongPtr, ByVal cmd As Long, ByRef argp As Long) As Long
    
    Public Declare PtrSafe Function listen Lib "ws2_32.dll" (ByVal s As LongPtr, ByVal backlog As Long) As Long
    Public Declare PtrSafe Function accept Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef addr As sockaddr_in, ByRef addrLen As Long) As LongPtr
    Public Declare PtrSafe Function recv Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef buf As Byte, ByVal buflen As Long, ByVal flags As Long) As Long
    Public Declare PtrSafe Function send Lib "ws2_32.dll" (ByVal s As LongPtr, ByRef buf As Byte, ByVal buflen As Long, ByVal flags As Long) As Long
    
    
    
    
    
    Public Declare PtrSafe Function ntohs Lib "ws2_32.dll" (ByVal netshort As Integer) As Integer
    
    Public Declare PtrSafe Function WSAStartup Lib "ws2_32.dll" (ByVal wVersionRequested As Integer, ByRef lpWSAData As wsaData) As Long
    Public Declare PtrSafe Function WSACleanup Lib "ws2_32.dll" () As Long

#Else
    ' timeval structure
    Public Type timeval
        tv_sec As Long
        tv_usec As Long
    End Type

    Public Const FD_SETSIZE As Long = 64
    Public Type fd_set
        fd_count As Long
        fd_array(FD_SETSIZE - 1) As Long
    End Type

    ' Winsock API declarations (32-bit)
    Public Declare Function VBSelect Lib "ws2_32.dll" Alias "select" ( _
        ByVal nfds As Long, _
        ByRef readfds As fd_set, _
        ByRef writefds As fd_set, _
        ByRef exceptfds As fd_set, _
        ByRef timeout As timeval) As Long

    Public Declare Function inet_ntoa Lib "ws2_32.dll" (ByVal inaddr As Long) As Long
    Public Declare Function gethostname Lib "ws2_32.dll" (ByVal name As String, ByVal namelen As Long) As Long
    Public Declare Function connect Lib "ws2_32.dll" (ByVal s As Long, ByRef addr As sockaddr_in, ByVal namelen As Long) As Long
    Public Declare Function socket Lib "ws2_32.dll" (ByVal af As Long, ByVal s_type As Long, ByVal protocol As Long) As Long
    Public Declare Function closesocket Lib "ws2_32.dll" (ByVal s As Long) As Long
    Public Declare Function ioctlsocket Lib "ws2_32.dll" (ByVal s As Long, ByVal cmd As Long, ByRef argp As Long) As Long
    Public Declare Function bind Lib "ws2_32.dll" (ByVal s As Long, ByRef addr As sockaddr_in, ByVal namelen As Long) As Long
    Public Declare Function listen Lib "ws2_32.dll" (ByVal s As Long, ByVal backlog As Long) As Long
    Public Declare Function accept Lib "ws2_32.dll" (ByVal s As Long, ByRef addr As sockaddr_in, ByRef addrlen As Long) As Long
    Public Declare Function recv Lib "ws2_32.dll" (ByVal s As Long, ByRef buf As Byte, ByVal buflen As Long, ByVal flags As Long) As Long
    Public Declare Function send Lib "ws2_32.dll" (ByVal s As Long, ByRef buf As Byte, ByVal buflen As Long, ByVal flags As Long) As Long
    Public Declare Function sendto Lib "ws2_32.dll" (ByVal s As Long, ByRef buf As Byte, ByVal buflen As Long, ByVal flags As Long, ByRef toaddr As sockaddr_in, ByVal tolen As Long) As Long
    Public Declare Function recvfrom Lib "ws2_32.dll" (ByVal s As Long, ByRef buf As Byte, ByVal buflen As Long, ByVal flags As Long, ByRef fromaddr As sockaddr_in, ByRef fromlen As Long) As Long
    Public Declare Function setsockopt Lib "ws2_32.dll" (ByVal s As Long, ByVal level As Long, ByVal optname As Long, ByRef optval As Any, ByVal optlen As Long) As Long
    Public Declare Function inet_addr Lib "ws2_32.dll" (ByVal cp As String) As Long
    Public Declare Function htons Lib "ws2_32.dll" (ByVal hostshort As Long) As Integer
    Public Declare Function ntohs Lib "ws2_32.dll" (ByVal netshort As Integer) As Integer
    Public Declare Function WSAGetLastError Lib "ws2_32.dll" () As Long
    Public Declare Function WSAStartup Lib "ws2_32.dll" (ByVal wVersionRequested As Integer, ByRef lpWSAData As WSAData) As Long
    Public Declare Function WSACleanup Lib "ws2_32.dll" () As Long
#End If

' --- Constants ---
Public Const SOCK_STREAM As Long = 1
Public Const IPPROTO_TCP As Long = 6

Public Const FIONBIO As Long = &H8004667E
Public Const WSAEWOULDBLOCK As Long = 10035
Public Const INADDR_ANY As Long = 0

Public Type wsaData
    wVersion As Integer
    wHighVersion As Integer
    szDescription(0 To 255) As Byte
    szSystemStatus(0 To 127) As Byte
    iMaxSockets As Integer
    iMaxUdpDg As Integer
    lpVendorInfo As Long
End Type

' --- DNS Constants ---
Public Const DNS_TYPE_A As Integer = 1
Public Const DNS_TYPE_AAAA As Integer = 28
Public Const DNS_TYPE_PTR As Integer = 12
Public Const DNS_TYPE_SRV As Integer = 33
Public Const DNS_TYPE_TXT As Integer = 16
Public Const DNS_CLASS_IN As Integer = 1



' --- Kernel32 Synchronisation ---
' NOTE: CreateMutex, ReleaseMutex, WaitForSingleObject, CloseHandle are declared
' in WinAPI.bas. Callers using WinsockDeclares.X for these should switch to WinAPI.X
' to avoid duplicate Public Declare compile errors. WSASocket is winsock-specific.
#If VBA7 Then
    Public Declare PtrSafe Function WSASocket Lib "ws2_32.dll" Alias "WSASocketA" (ByVal af As Long, ByVal sType As Long, ByVal protocol As Long, ByVal lpProtocolInfo As Long, ByVal g As Long, ByVal dwFlags As Long) As Long
#Else
    Public Declare Function WSASocket Lib "ws2_32.dll" Alias "WSASocketA" (ByVal af As Long, ByVal sType As Long, ByVal protocol As Long, ByVal lpProtocolInfo As Long, ByVal g As Long, ByVal dwFlags As Long) As Long
#End If



const express = require("express");
const morgan = require('morgan');
const winston = require('./config/winston');
const mongoose = require("mongoose");
const session = require("express-session");
const cookieParser = require('cookie-parser');
const passport = require("passport");
const LocalStrategy = require("passport-local");
const socket = require("socket.io");
const dotenv = require("dotenv");
const flash = require("connect-flash");
const Post = require("./models/Post");
const User = require("./models/User");
// 보안 관련 모듈 : helmet, hpp
const helmet = require('helmet');
const hpp = require('hpp');

const port = process.env.PORT || 3000;  // 포트를 3000번으로 설정
const onlineChatUsers = {};             // 채팅 기능을 위해서 user의 정보를 담을 onlineChatUsers라는 객체 변수를 할당

dotenv.config();    // .env 파일의 변수를 사용할 수 있게 해주는 메서드를 호출

const postRoutes = require("./routes/posts");   // 게시글 관련한 라우터
const userRoutes = require("./routes/users");   // 사용자에 관한 라우터
const app = express();

app.set("view engine", "ejs");  // ejs를 사용해 view를 구성하기 위한 셋팅

/* 미들웨어 장착 */
if (process.env.NODE_ENV === 'production') {    // 배포 시
    // app.enable('trust proxy');
    app.use(morgan('combined'));
    // helmet, hpp 모듈로 XSS, CSRF 등 웹 취약점 공격 방지
    // helmet, hpp 모듈의 기능은 교재 p.342 참고
    app.use(helmet({contentSecurityPolicy : false}));   // contentSecurityPolicy옵션은 외부 css, script 로딩 시 오류가 나지 않도록 false로 설정
    app.use(hpp());
}
else {  // 개발 시
    app.use(morgan('dev'));
}
// cookie-parser와 express-session의 비밀키는 .env파일에 생성
app.use(cookieParser(process.env.SECRET))
const sessOptions = {   // 각 옵션 설명은 교재 p.340 참고
    secret : process.env.SECRET,
    resave : false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
    },
}
if (process.env.NODE_ENV === 'production') {    // 배포 시 sessOptions 추가 및 변경
    // sessOptions.proxy = true;
    // sessOptions.cookie.secure = true;
}
app.use(session(sessOptions));
app.use(flash());

/* passport 셋팅 */
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

/* 미들웨어 장착 */
// body parse를 위한 express의 json, urlencoded를 장착
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

/* MongoDB Connection */
// host : 127.0.0.1(local)
// MongoDB 기본 포트 : 27017
// 데이터베이스명 : facebook_clone
mongoose
    .connect("mongodb://127.0.0.1:27017/facebook_clone", {
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true
    })
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((err) => {
        winston.error(err);
    });

/* Template 파일에 user, Authentication, flash와 관련한 변수 전송 */
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.login = req.isAuthenticated();
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});

/* 라우터를 장착해주고 서버와 연결 */
app.use("/", userRoutes);
app.use("/", postRoutes);
const server = app.listen(port, () => {
    winston.info(`App is running on port ${port}`);
});

/* WebSocket setup - socket.io를 이용해 websocket 통신을 구현 */
const io = socket(server);  // http 통신을 하는 express 서버와 연결

const room = io.of("/chat");
room.on("connection", socket => {
    winston.info("new user : ", socket.id);

    // room.emit : 모든 사용자에게 메시지를 보냄
    // socket.on : 특정 이벤트에만 메시지를 보냄
    room.emit("newUser", { socketID: socket.id });

    // 새로운 사용자가 들어왔을 때
    socket.on("newUser", data => {
        if (!(data.name in onlineChatUsers)) {
            onlineChatUsers[data.name] = data.socketID; // 새로운 사용자가 들어오면 onlineChatUsers 객체 변수에 해당 사용자를 넣어줌
            socket.name = data.name;
            room.emit("updateUserList", Object.keys(onlineChatUsers));
            winston.info("data.name : " + data.name); 
            winston.info("data.socketID : " + data.socketID); 
            winston.info("Online users : " + Object.keys(onlineChatUsers));  
        }
    });

    // 사용자가 나갔을 때
    socket.on("disconnect", () => {
        delete onlineChatUsers[socket.name];    // 사용자가 채팅 방을 나가면 onlineChatUsers 객체 변수에서 사용자 정보를 삭제
        room.emit("updateUserList", Object.keys(onlineChatUsers));
        winston.info(`user ${socket.name} disconnected`);
    });

    // 사용자들이 메시지를 보냈을 때
    socket.on("chat", data => {
        winston.info(data);
        if (data.to === "Global Chat") {
            room.emit("chat", data);
        } else if (data.to) {
            room.to(onlineChatUsers[data.name]).emit("chat", data);
            room.to(onlineChatUsers[data.to]).emit("chat", data);
            winston.info("data.name : " + data.name);
            winston.info("data.to : " + data.to);
        }
    });
});
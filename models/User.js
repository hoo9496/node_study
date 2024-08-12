// 사용자 정보 관련 데이터 Collection의 스키마를 정의할 js 파일

const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

// 사용자 스키마 정의
let UserSchema = new mongoose.Schema({
    username: String,
    firstName: String,
    lastName: String,
    password: String,
    profile: String,
    posts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post"
        }
    ],

    liked_posts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post"
        }
    ],

    liked_comments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post"
        }
    ],
    friends: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    friendRequests: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ]
});

UserSchema.plugin(passportLocalMongoose);   // 사용자 인증을 위해 passport-local-mongoose 모듈과 스키마를 연결해줌
let User = mongoose.model("User", UserSchema);  // UserSchema 구조를 따르는 User라는 이름의 인스턴스를 생성, MongoDB 저장소에 User라는 Document가 생성됨
module.exports = User;

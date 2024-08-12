const express = require("express");
const User = require("../models/User");
const passport = require("passport");
const multer = require("multer");   // 이미지, 동영상 등의 파일 데이터 처리를 위한 모듈
const cloudinary = require("cloudinary");   // 이미지를 업로드하고 불러올 공간을 빌리기 위해 SaaS 서비스인 cloudinary를 사용
const router = express.Router();
const csrf = require('csurf');
const csrfProtection = csrf({cookie : true}); // 보안 관련 모듈

/* Multer setup */
// multer는 텍스트 정보를 저장하는 body 객체와 멀티파트 데이터를 저장하는 file 객체를 req 객체에 추가해주게 됨.
const storage = multer.diskStorage({    // 저장 경로와 파일명 처리 메서드
    // cloudinary 모듈을 사용해서 파일을 저장할 것이므로 저장 경로는 따로 설정하지 않고 filename만 설정
    // diskStorage() 메서드의 인자로 객체를 보내주었는데 filename 이라는 키 값은 함수이며 이 함수의 인자인 callback을 통해 전송된 파일명을 설정함.
    filename: (req, file, callback) => {
        callback(null, Date.now() + file.originalname);
    }
});

const imageFilter = (req, file, callback) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {   // 파일의 확장자 확인
        return callback(new Error("Only image files are allowed!"), false); // 메시지와 함께 오류 객체를 담은 콜백 함수를 반환
    }
    callback(null, true);
};

// upload 변수에 multer의 인스턴스를 생성 (storage 옵션 : 파일이 저장될 위치, fileFilter 옵션 : 어떤 파일을 허용할지 제어)
const upload = multer({ storage: storage, fileFilter: imageFilter });

/* Cloudinary setup */
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/* Middleware */
// 로그인하지 않은 사용자를 체크하는 미들웨어 - 필요한 라우터에 인자로 넣어 로그인이 필요한 동작(프로필 조회, 친구 추가 등)을 할 경우 로그인 했는지를 확인하는 역할
const isLoggedIn = (req, res, next) => {
    console.log("users로그인 체크...");
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash("error", "로그인이 필요합니다.");
    res.redirect("/user/login");
};

/* Routers */

/* User Routers */
// 회원가입을 위한 라우터
router.post("/user/register", upload.single("image"), (req, res) => {
    console.log("/user/register router on");
    if (
        req.body.username &&
        req.body.firstname &&
        req.body.lastname &&
        req.body.password
    ) {
        let newUser = new User({
            username: req.body.username,
            firstName: req.body.firstname,
            lastName: req.body.lastname
        });

        // 처음 회원가입을 할 때 프로필 이미지를 받고 이를 multer를 통해 req.file에 설정
        if (req.file) {
            // cloudinary를 이용해 파일을 업로드하고 사용자 프로필을 설정한 뒤 createUser() 함수를 통해 사용자 인스턴스를 생성
            cloudinary.uploader.upload(req.file.path, result => {
                newUser.profile = result.secure_url;
                console.log("req.file.path :: " + req.file.path);
                console.log("result.secure_url :: " + result.secure_url);
                return createUser(newUser, req.body.password, req, res);
            });
        } else {    // 프로필 사진이 없는 경우 DEFAULT_PROFILE_PIC을 프로필 사진으로 지정
            newUser.profile = process.env.DEFAULT_PROFILE_PIC;
            return createUser(newUser, req.body.password, req, res);
        }
    }
});

// newUser 객체와 비밀번호를 인자로 받아 User모델에 넣고 passport를 통해 authenticate()로 인증을 수행
function createUser(newUser, password, req, res) {
    User.register(newUser, password, (err, user) => {
        if (err) {
            req.flash("error", err.message);
            res.redirect("/");
        } else {
            passport.authenticate("local")(req, res, function () {
                console.log("req.user : " + req.user);
                req.flash( "success", "회원가입 및 로그인이 완료되었습니다!");
                res.redirect("/");
            });
        }
    });
}

/* 로그인을 하는 라우터(get, post) */
// get 방식을 통해 view/users/login.ejs 파일을 렌더링해주고, post 방식을 통해 passport 인증을 수행
// csurf 모듈을 사용하여 csrf 공격 방어
router.get("/user/login", csrfProtection, (req, res) => {
    res.render("users/login", {csrfToken : req.csrfToken()});
});
router.post(
    "/user/login",
    csrfProtection,
    passport.authenticate("local", {
        successRedirect: "/",
        failureRedirect: "/user/login"
    }),
    (req, res) => { }
);

/* 로그인한 모든 사용자를 보여주는 라우터 */
// User.find() 함수를 통해 모든 사용자를 조회하고 view/users/users.ejs에 user 객체를 보내주고 렌더링해줌
router.get("/user/all", isLoggedIn, (req, res) => {
    User.find({}, (err, users) => {
        if (err) {
            console.log("err : " + err);
            req.flash("error", "모든 사용자 정보를 가져오는 중에 문제가 발생했습니다.");    
            res.redirect("/");
        } else {
            res.render("users/users", { users: users });
        }
    });
});

/* 로그아웃 라우터 */
// passport가 req 객체에 logout() 메서드를 만들어주기 때문에 이를 이용
router.get("/user/logout", (req, res) => {
    req.logout();
    res.redirect("back");
});

/* 사용자 프로필 생성 라우터 */
router.get("/user/:id/profile", isLoggedIn, (req, res) => {
    // req.params 객체에 있는 id를 통해 사용자를 조회하고 mongoose의 populate() 메서드를 통해 friends, friendRequests, post 필드의 Document를 조회
    // exec()를 통해 결과인 user를 콜백으로 넘겨주고 이를 views/users/user.ejs 화면에서 받아 렌더링할 수 있게 함.
    User.findById(req.params.id)
        .populate("friends")
        .populate("friendRequests")
        .populate("posts")
        .exec((err, user) => {
            if (err) {
                console.log("err :: " + err);
                req.flash("error", "오류가 발생했습니다.");
                res.redirect("back");
            } else {
                console.log("user :: " + user);
                res.render("users/user", { userData: user });
            }
        });
});

/* 친구 추가 기능 라우터 */
// :id 부분이 req.params로 들어오고 들어온 id 값을 이용해서 사용자를 찾음(findById)
router.get("/user/:id/add", isLoggedIn, (req, res) => {
    User.findById(req.user._id, (err, user) => {
        if (err) {
            console.log("err :: " + err);
            req.flash("error", "이 사람을 친구 목록에 추가하는 중에 오류가 발생했습니다"); 
            res.redirect("back");
        } else {
            User.findById(req.params.id, (err, foundUser) => {
                // 해당 사용자의 아이디를 찾을 수 없는 경우
                if (err) {
                    console.log("err :: " + err);
                    req.flash("error", "사람을 찾을 수 없습니다");
                    res.redirect("back");
                } else {
                    // 이미 친구 추가 요청을 보낸 경우
                    if (
                        foundUser.friendRequests.find(o =>
                            o._id.equals(user._id)
                        )
                    ) {
                        console.log("foundUser :: " + foundUser);
                        req.flash("error", `이미 ${user.firstName}님에게 친구 요청을 보냈습니다.`);
                        return res.redirect("back");
                    } 
                    // 이미 친구인 경우
                    else if (
                        foundUser.friends.find(o => o._id.equals(user._id))
                    ) {
                        console.log("foundUser :: " + foundUser);
                        req.flash("error", `사용자 ${foundUser.firstname} 이(가) 이미 친구 목록에 있습니다.`);
                        return res.redirect("back");
                    }
                    let currUser = {
                        _id: user._id,
                        firstName: user.firstName,
                        lastName: user.lastName
                    };
                    foundUser.friendRequests.push(currUser);    // 요청을 보낸 친구 foundUser를 friendRequests에 추가
                    foundUser.save();
                    req.flash("success", `${foundUser.firstName}에게 친구 요청을 보냈습니다.`);
                    res.redirect("back");
                }
            });
        }
    });
});

/* 요청 받은 친구 추가 요청을 사용자가 수락하는 기능을 다루는 라우터 */
// findById() 메서드를 통해 요청한 친구의 id를 User Collection에서 조회하고 해당 사용자의 friends 키 값에 추가한 친구를 업데이트
router.get("/user/:id/accept", isLoggedIn, (req, res) => {
    User.findById(req.user._id, (err, user) => {
        if (err) {
            console.log("err :: " + err);
            req.flash("error", "프로필을 찾는 중 오류가 발생했습니다. 연결되어 있나요?");
            res.redirect("back");
        } else {
            User.findById(req.params.id, (err, foundUser) => {
                let r = user.friendRequests.find(o =>
                    o._id.equals(req.params.id)
                );
                if (r) {
                    let index = user.friendRequests.indexOf(r);
                    user.friendRequests.splice(index, 1);
                    let friend = {
                        _id: foundUser._id,
                        firstName: foundUser.firstName,
                        lastName: foundUser.lastName
                    };
                    user.friends.push(friend);
                    user.save();

                    let currUser = {
                        _id: user._id,
                        firstName: user.firstName,
                        lastName: user.lastName
                    };
                    foundUser.friends.push(currUser);
                    foundUser.save();
                    req.flash("success", `당신과 ${foundUser.firstName}님이 친구가 되었습니다.`);
                    res.redirect("back");
                } else {
                    req.flash("error", "오류가 발생했습니다. 추가하려는 프로필이 요청에 포함되어 있습니까?");
                    res.redirect("back");
                }
            });
        }
    });
});

/* 친구 추가 요청을 거절하는 기능을 다루는 라우터 */
// req.params로 들어온 id값을 이용해 사용자를 찾고, user의 friendRequests를 삭제해서 해당 요청을 거절한다
router.get("/user/:id/decline", isLoggedIn, (req, res) => {
    User.findById(req.user._id, (err, user) => {
        if (err) {
            console.log("err : " + err);
            req.flash("error", "요청을 거부하는 중에 오류가 발생했습니다.");
            res.redirect("back");
        } else {
            User.findById(req.params.id, (err, foundUser) => {
                if (err) {
                    console.log(err);
                    req.flash("error", "요청을 거부하는 중에 오류가 발생했습니다.");
                    res.redirect("back");
                } else {
                    // remove request
                    let r = user.friendRequests.find(o =>
                        o._id.equals(foundUser._id)
                    );
                    if (r) {
                        let index = user.friendRequests.indexOf(r);
                        user.friendRequests.splice(index, 1);
                        user.save();
                        req.flash("success", "거절하였습니다.");
                        res.redirect("back");
                    }
                }
            });
        }
    });
});

/* Chat 라우터 */
// User 컬렉션에서 user를 찾고 해당 user의 friends 값을 populate()를 통해 접근하고 가져온 데이터를 views/users/chat.ejs에 보내주고 렌더링한다
router.get("/chat", isLoggedIn, (req, res) => {
    User.findById(req.user._id)
        .populate("friends")
        .exec((err, user) => {
            if (err) {
                console.log("err :: " + err);
                req.flash("error", "채팅에 엑세스하는 중 오류가 발생했습니다.");
                res.redirect("/");
            } else {
                res.render("users/chat", { userData: user });
            }
        });
});

module.exports = router;    // 위에서 작성한 모든 router를 app.js에서 사용할 수 있도록 함

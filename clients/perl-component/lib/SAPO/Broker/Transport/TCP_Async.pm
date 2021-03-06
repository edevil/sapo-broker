package SAPO::Broker::Transport::TCP_Async;

use AnyEvent::Handle;
use Carp qw(croak);

use strict;
use warnings;
use Data::Dumper;

use base qw(SAPO::Broker::Transport);

sub new {
    my $class  = shift @_;
    my %params = @_;

    my $self = $class->SUPER::new(%params);

    #print STDERR __PACKAGE__ . "::params: ", Dumper( \%params );
    my $socket = AnyEvent::Handle->new(
        connect => [ $params{host}, $params{port} ],

        #on_rtimeout => sub { die "read timeout" },
        #on_wtimeout => sub { die "write timeout" },
        #on_eof => sub { delete $self->{__socket} },
        on_error => sub {
            my ( $h, $fatal, $msg ) = @_;

            #print STDERR "on_error: [$fatal]\n";
            $params{error_cb}->( $msg, $fatal ) if $params{error_cb};
            $self->__drain($msg);

            delete $self->{__socket} if $fatal;
        },
        on_prepare => sub {

            #print STDERR "on prepare\n";
            return $params{ctimeout} || 10;
        },

        #on_connect => sub { shift->timeout_reset },
        autocork  => 1,
        keepalive => 1,
    );

    if ( defined $socket ) {
        $self->{__socket} = $socket;
        $self->{_wcbs}    = [];

        if ( defined $params{rcb} ) {
            $socket->on_read(
                sub {

                    #print STDERR "on_read\n";
                    $self->receive( cb => $params{rcb} );
                } );
        }

        if ( defined $params{wcb} ) {
            $socket->on_drain(
                sub {
                    $_[0]->wtimeout(0);
                    if ( !$self->__drain() ) {
                        $params{wcb}->();
                    }
                } );
        } else {
            $socket->on_drain( sub { $_[0]->wtimeout(0); $self->__drain } );
        }

        if ( defined $params{tls} ) {
            $socket->starttls('connect');
        }

        return bless $self, $class;
    } else {
        die "Couldn't create socket. $!\n";
    }
} ## end sub new

sub __drain {
    my ( $self, $error ) = @_;

    #print STDERR "on_drain error [",$error || "","]\n";

    #$self->{__socket}->wtimeout(0);
    $self->{__socket}->wtimeout(0);

    if ( scalar @{ $self->{_wcbs} } ) {
        for my $cb ( @{ $self->{_wcbs} } ) {

            #print STDERR "on_drain: calling cb\n";
            $cb->($error);
        }

        $self->{_wcbs} = [];
        return 1;
    }
}

sub __write {
    my ( $self, $payload, %args ) = @_;

    #print STDERR "__write", Dumper(\%args),"\n";

    if ( !exists $self->{__socket} ) { die "stale socket" }

    if ( defined $args{timeout} && $args{timeout} > 0 ) {
        $self->{__socket}->wtimeout( $args{timeout} );
    }

    $self->{__socket}->push_write($payload);

    if ( defined $args{cb} ) {
        push @{ $self->{_wcbs} }, $args{cb};
    }
}

sub __read {
    my ( $self, $len, %args ) = @_;

    if ( !exists $self->{__socket} ) { die "stale socket" }

    if ( defined $args{timeout} && $args{timeout} > 0 ) {
        $self->{__socket}->rtimeout( $args{timeout} );
    }

    #print STDERR __PACKAGE__."::__read($len)\n";
    $self->{__socket}->push_read(
        chunk => $len,
        sub {
            my ( undef, $data ) = @_;
            if ( defined $args{cb} ) { $args{cb}->($data); }
        } );
}

sub send {
    my ( $self, $message, %args ) = @_;
    return $self->__write( $message->serialize(), %args );
}

sub receive {
    my ( $self, %args ) = @_;

    #read the header
    my ( $type, $version, $length );

    #print STDERR __PACKAGE__."::read\n";

    $self->__read(
        8,
        timeout => $args{timeout},
        cb      => sub {

            #print STDERR __PACKAGE__."::read CB\n";
            ( $type, $version, $length ) = SAPO::Broker::Transport::Message::__meta_from_header( $_[0] );

            #print STDERR __PACKAGE__."::read CB [$type]\n";
            $self->__read(
                $length,
                defined $args{timeout} ? ( timeout => $args{timeout} ) : (),
                cb => sub {
                    my $msg = SAPO::Broker::Transport::Message->new( {
                            'type'    => $type,
                            'version' => $version,
                            'payload' => $_[0] } );

                    if ( $args{cb} ) { $args{cb}->($msg) }
                } );
        } );

    #read the payload
} ## end sub receive

sub DESTROY {
    my ($self) = @_;
    my $socket = $self->{'__socket'};
    return $socket ? $socket->push_shutdown() : undef;
}

1;
